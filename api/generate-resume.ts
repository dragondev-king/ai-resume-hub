import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { normalizeJobTitle, JOB_TITLE_EXTRACTION_INSTRUCTIONS } from '../src/utils/jobTitlePrompt';
import {
  applyCareerTitleProgression,
  mostRecentIndices,
  toneDescriptionsToSeniority,
} from '../src/utils/careerProgression';

type AIProvider = 'openai' | 'claude';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MAX_JOB_DESCRIPTION_CHARS = 10000;
const MAX_RESUME_OUTPUT_TOKENS = 8000;
const MAX_COMPANY_PICK_TOKENS = 1200;
const MAX_REPAIR_TOKENS = 6000;

const CLAUDE_MODEL = 'claude-sonnet-4-6';

/** Original main-branch system prompt - used when tailor-company checkbox is OFF. */
const SYSTEM_PROMPT_ORIGINAL =
  `You are an expert resume writer specializing in career transitions and role-specific tailoring. Your goal is to transform a candidate's experience to make them appear as an ideal fit for the target position, even if their original experience doesn't perfectly match. Be creative and strategic in highlighting transferable skills, relevant technologies, and adaptable experience. Generate 7-12 bullet points per work experience, with varying counts based on role complexity and duration. ${JOB_TITLE_EXTRACTION_INSTRUCTIONS} Also extract companyName. CRITICAL: Aggressively tailor job titles and experience descriptions to align with the target role while maintaining authenticity and keeping company names unchanged. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>).`;

/** Tailor-company mode system prompt - used when checkbox is ON. */
const SYSTEM_PROMPT_TAILOR_COMPANY =
  `You are an expert resume writer. Return ONLY complete valid JSON. ${JOB_TITLE_EXTRACTION_INSTRUCTIONS} Also extract companyName. Every experience item MUST include a non-empty "descriptions" array. The TWO MOST RECENT roles need PLENTY of content: 8-10 long, detailed bullets each covering industry/field experience, technical delivery, AND remote/distributed-team collaboration. Older roles: 5-7 technical-focused bullets. Bullet tone MUST match that role's seniority: Junior/entry roles must NOT lead teams, own architecture, or mentor; use contribute/implement/build language. Mid roles own features; Senior roles may lead and mentor. Never omit descriptions. Never use "description" (singular) - always "descriptions" (array of strings). Wrap tech skills with <b>...</b> ONLY inside experience description bullets - never in the skills array, summary, jobTitle, companyName, or position. The skills array must be plain strings only (e.g. "Node.js", not "<b>Node.js</b>"). Rewrite EVERY experience "position" for the target JD into a junior-to-senior career ladder by employment dates. Never reuse the candidate's original profile titles. Only the two most recent company names may already be substituted; keep older company names exact.`;

const SYSTEM_PROMPT_COMPANY_PICK =
  'You research mid-market employers. Return ONLY valid JSON with targetCompany, industry, and replacements[]. Prefer real mid-sized lesser-known peers (about 50-500 employees). Never suggest famous giants or the target company itself. CRITICAL: replacements must have NO business relationship with the hiring company (not partners, customers, vendors, subsidiaries, parents, affiliates, investors, portfolio companies, contractors, or companies named in the JD). The ONLY allowed relationship is being a direct rival/competitor.';

const SYSTEM_PROMPT_REPAIR =
  'You fill and enrich resume bullet points. Return ONLY valid JSON: { "experience": [ { "descriptions": ["bullet", ...] } ] } with one entry per input role. For the two most recent roles when asked, write 8-10 plentiful detailed bullets covering industry/field experience, technical delivery, and remote/distributed-team contributions. Older roles: 5-7 technical bullets. Bullet seniority MUST match the role title (Junior never Led/Owned architecture/Mentored). Wrap tech skills in <b>...</b>.';

const RESUME_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    jobTitle: { type: 'string' },
    companyName: { type: 'string' },
    summary: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'string' },
          company: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          address: { type: 'string' },
          descriptions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['position', 'company', 'start_date', 'end_date', 'address', 'descriptions'],
        additionalProperties: false,
      },
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['jobTitle', 'companyName', 'summary', 'experience', 'skills'],
  additionalProperties: false,
};

const COMPANY_PICK_SCHEMA = {
  type: 'object',
  properties: {
    targetCompany: { type: 'string' },
    industry: { type: 'string' },
    replacements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          address: { type: 'string' },
        },
        required: ['company', 'address'],
        additionalProperties: false,
      },
    },
  },
  required: ['targetCompany', 'industry', 'replacements'],
  additionalProperties: false,
};

const REPAIR_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descriptions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['descriptions'],
        additionalProperties: false,
      },
    },
  },
  required: ['experience'],
  additionalProperties: false,
};

interface RequestBody {
  profile: any;
  jobDescription: string;
  provider?: AIProvider;
  tailorCompanyNames?: boolean;
}

type CompanyReplacement = { company: string; address: string };

type CompanyPickResult = {
  targetCompany: string;
  industry: string;
  replacements: CompanyReplacement[];
};

function truncateJobDescription(jobDescription: string): string {
  const trimmed = jobDescription.trim();
  if (trimmed.length <= MAX_JOB_DESCRIPTION_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_JOB_DESCRIPTION_CHARS)}\n\n[Job description truncated for length; use the content above as the source of truth.]`;
}

function cloneProfile(profile: any) {
  return JSON.parse(JSON.stringify(profile));
}

function applyCompanyReplacements(profile: any, replacements: CompanyReplacement[]): any {
  const next = cloneProfile(profile);
  const experience = Array.isArray(next.experience) ? next.experience : [];
  const recentOrdered = mostRecentIndices(experience, 2);
  const count = Math.min(replacements.length, recentOrdered.length);
  for (let i = 0; i < count; i++) {
    const expIndex = recentOrdered[i];
    experience[expIndex] = {
      ...experience[expIndex],
      company: replacements[i].company,
      address: replacements[i].address || experience[expIndex].address || '',
    };
  }
  next.experience = experience;
  return next;
}

function forceCompaniesOnParsed(
  parsed: any,
  replacements: CompanyReplacement[],
  originalProfile?: any
): any {
  if (!Array.isArray(parsed?.experience)) return parsed;
  const originalExperience = Array.isArray(originalProfile?.experience)
    ? originalProfile.experience
    : [];
  const next = { ...parsed, experience: [...parsed.experience] };
  const recentOrdered = mostRecentIndices(
    originalExperience.length ? originalExperience : next.experience,
    2
  );
  const recentSet = new Set(recentOrdered);

  for (let i = 0; i < next.experience.length; i++) {
    const original = originalExperience[i];
    const recentSlot = recentOrdered.indexOf(i);
    if (recentSet.has(i) && recentSlot >= 0 && replacements[recentSlot]) {
      next.experience[i] = {
        ...next.experience[i],
        company: replacements[recentSlot].company,
        address: replacements[recentSlot].address || next.experience[i].address || '',
        descriptions: normalizeDescriptions(next.experience[i]),
      };
    } else {
      next.experience[i] = {
        ...next.experience[i],
        company: original?.company || next.experience[i].company,
        address: original?.address || next.experience[i].address || '',
        start_date: original?.start_date || next.experience[i].start_date,
        end_date: original?.end_date || next.experience[i].end_date,
        descriptions: normalizeDescriptions(next.experience[i]),
      };
    }
  }
  return next;
}

/** Force junior->senior titles and seniority-matched bullet tone. */
function applyTitleProgression(parsed: any, jobDescription?: string): any {
  if (!parsed || !Array.isArray(parsed.experience) || parsed.experience.length === 0) {
    return parsed;
  }
  const jobTitle = normalizeJobTitle(parsed.jobTitle);
  const normalized = parsed.experience.map((exp: any) => ({
    ...exp,
    descriptions: normalizeDescriptions(exp),
  }));
  const withLadder = applyCareerTitleProgression(
    normalized,
    jobTitle || 'Software Engineer'
  );
  return {
    ...parsed,
    jobTitle: jobTitle || parsed.jobTitle || '',
    experience: toneDescriptionsToSeniority(withLadder),
  };
}

/** Always normalize extracted jobTitle into a clean professional title. */
function finalizeJobTitle(parsed: any, _jobDescription?: string): any {
  if (!parsed) return parsed;
  const jobTitle = normalizeJobTitle(parsed.jobTitle);
  return {
    ...parsed,
    jobTitle: jobTitle || parsed.jobTitle || '',
  };
}

function stripCodeFences(text: string): string {
  let jsonString = text.trim();
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return jsonString;
}


function parseJsonLoose(text: string): any {
  let jsonString = stripCodeFences(text);
  if (!jsonString.startsWith('{')) {
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    jsonString = jsonMatch[0];
  }
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(jsonString);
}

/** Accept descriptions / description / bullets / achievements from messy model output. */
function normalizeDescriptions(exp: any): string[] {
  if (!exp || typeof exp !== 'object') return [];

  const fromArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && typeof (item as any).text === 'string') {
          return String((item as any).text).trim();
        }
        return '';
      })
      .filter(Boolean);
  };

  const fromDescriptions = fromArray(exp.descriptions);
  if (fromDescriptions.length) return fromDescriptions;

  const fromBullets = fromArray(exp.bullets);
  if (fromBullets.length) return fromBullets;

  const fromAchievements = fromArray(exp.achievements);
  if (fromAchievements.length) return fromAchievements;

  if (typeof exp.description === 'string' && exp.description.trim()) {
    const text = exp.description.trim();
    const lines = text
      .split(/\n+/)
      .map((line: string) => line.replace(/^\s*[-**]\s*/, '').trim())
      .filter(Boolean);
    return lines.length > 1 ? lines : [text];
  }

  if (Array.isArray(exp.description)) {
    return fromArray(exp.description);
  }

  return [];
}

function experienceHasAllDescriptions(experience: any[]): boolean {
  return (
    Array.isArray(experience) &&
    experience.length > 0 &&
    experience.every((exp) => normalizeDescriptions(exp).length > 0)
  );
}

/** Two most recent roles should have plenty of bullets in tailor-company mode. */
function experienceRecentRolesNeedEnrichment(experience: any[], minBullets = 8): boolean {
  if (!Array.isArray(experience) || experience.length === 0) return false;
  const recent = mostRecentIndices(experience, 2);
  return recent.some((index) => normalizeDescriptions(experience[index]).length < minBullets);
}

function normalizeSkillName(skill: unknown): string {
  if (typeof skill !== 'string') return '';
  return skill
    .replace(/<\/?(?:b|bold)>/gi, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSkillsList(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const cleaned = skills.map(normalizeSkillName).filter(Boolean);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const skill of cleaned) {
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(skill);
  }
  return unique;
}

function normalizeParsedResume(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const experience = Array.isArray(parsed.experience)
    ? parsed.experience.map((exp: any) => ({
        ...exp,
        descriptions: normalizeDescriptions(exp),
      }))
    : [];
  return {
    ...parsed,
    experience,
    skills: normalizeSkillsList(parsed.skills),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      profile,
      jobDescription,
      provider = 'openai',
      tailorCompanyNames = false,
    } = req.body as RequestBody;

    if (!profile || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields: profile and jobDescription' });
    }

    if (provider !== 'openai' && provider !== 'claude') {
      return res.status(400).json({ error: 'Invalid provider. Must be "openai" or "claude".' });
    }

    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.',
      });
    }

    if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY environment variable.',
      });
    }

    const jd = truncateJobDescription(jobDescription);
    const shouldTailorCompanies = Boolean(tailorCompanyNames);
    let profileForGeneration = profile;
    let companyPick: CompanyPickResult | null = null;

    if (shouldTailorCompanies) {
      // Prefer OpenAI for the tiny company-pick call (more reliable JSON); fall back to selected provider.
      const pickProvider: AIProvider =
        process.env.OPENAI_API_KEY ? 'openai' : provider;
      let lastPickError: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          companyPick = await pickSubstituteCompanies(profile, jd, pickProvider);
          break;
        } catch (err: any) {
          lastPickError = err instanceof Error ? err : new Error(String(err));
          console.error(`Company substitution attempt ${attempt + 1} failed:`, err);
        }
      }
      if (!companyPick?.replacements?.length) {
        return res.status(502).json({
          error: 'Failed to tailor company names',
          details:
            lastPickError?.message ||
            'Could not find mid-sized peer companies for this job. Please try again.',
        });
      }
      profileForGeneration = applyCompanyReplacements(profile, companyPick.replacements);
    }

    const prompt = shouldTailorCompanies
      ? createTailorCompanyAIPrompt(profileForGeneration, jd, companyPick?.industry || '')
      : createOriginalAIPrompt(profileForGeneration, jd);

    const systemPrompt = shouldTailorCompanies
      ? SYSTEM_PROMPT_TAILOR_COMPANY
      : SYSTEM_PROMPT_ORIGINAL;

    let rawResponse =
      provider === 'claude'
        ? await generateWithClaude(prompt, systemPrompt, RESUME_OUTPUT_SCHEMA, MAX_RESUME_OUTPUT_TOKENS)
        : await generateWithOpenAI(prompt, systemPrompt, MAX_RESUME_OUTPUT_TOKENS);

    if (!rawResponse?.trim()) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details: 'The AI returned an empty response. Please try again.',
      });
    }

    let parsed = normalizeParsedResume(parseJsonLoose(rawResponse));

    const needsRepair =
      !experienceHasAllDescriptions(parsed.experience) ||
      (shouldTailorCompanies && experienceRecentRolesNeedEnrichment(parsed.experience, 8));

    if (needsRepair) {
      console.warn('Resume missing or thin bullet points - running repair/enrich pass');
      parsed = await repairMissingDescriptions(parsed, profileForGeneration, jd, provider, {
        stressIndustryLast2: shouldTailorCompanies,
        industry: companyPick?.industry || '',
      });
    }

    if (shouldTailorCompanies) {
      if (companyPick?.replacements?.length) {
        parsed = forceCompaniesOnParsed(parsed, companyPick.replacements, profile);
      } else {
        parsed = normalizeParsedResume(parsed);
      }
      parsed = applyTitleProgression(parsed, jd);
    } else {
      parsed = normalizeParsedResume(parsed);
      parsed = finalizeJobTitle(parsed, jd);
    }

    if (!experienceHasAllDescriptions(parsed.experience)) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details:
          'The AI did not return experience bullet points. Please try again with a shorter job description.',
      });
    }

    return res.status(200).json({
      success: true,
      aiResponse: JSON.stringify(parsed),
      provider,
      companyPick: companyPick
        ? {
            targetCompany: companyPick.targetCompany,
            industry: companyPick.industry,
            replacements: companyPick.replacements,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error generating resume:', error);
    return res.status(500).json({
      error: 'Failed to generate resume',
      details: error.message,
    });
  }
}

async function repairMissingDescriptions(
  parsed: any,
  profile: any,
  jobDescription: string,
  provider: AIProvider,
  options: { stressIndustryLast2: boolean; industry: string }
): Promise<any> {
  const experience = Array.isArray(parsed.experience) ? parsed.experience : [];
  const profileExperience = Array.isArray(profile.experience) ? profile.experience : [];

  const roles = experience.map((exp: any, index: number) => ({
    index,
    position: exp.position || profileExperience[index]?.position || '',
    company: exp.company || profileExperience[index]?.company || '',
    start_date: exp.start_date || profileExperience[index]?.start_date || '',
    end_date: exp.end_date || profileExperience[index]?.end_date || '',
    originalDescription: profileExperience[index]?.description || '',
    existingDescriptions: normalizeDescriptions(exp),
  }));

  const recentSet = options.stressIndustryLast2
    ? new Set(mostRecentIndices(roles, 2))
    : new Set<number>();

  const prompt = `
Fill missing resume bullet points for these roles.

JOB DESCRIPTION:
${jobDescription}

ROLES:
${roles
  .map(
    (role: any) => `
[${role.index}] ${role.position} at ${role.company} (${role.start_date} - ${role.end_date})${
      recentSet.has(role.index)
        ? ' ★ TWO MOST RECENT — write 8-10 plentiful bullets (industry + tech + remote work)'
        : ''
    }
Original notes: ${role.originalDescription || '(none)'}
Existing bullets: ${
      role.existingDescriptions.length
        ? JSON.stringify(role.existingDescriptions)
        : '(MISSING - generate bullets)'
    }
`
  )
  .join('\n')}

RULES:
- Return one experience entry per role, same order
- Match bullet seniority to that role's position title:
  - Junior/Jr/Entry: Contribute, Implement, Build, Assist, Debug, Write — NEVER Led, Owned architecture, Mentored, Spearheaded, Directed
  - Associate/mid (no Junior/Senior): Own features/components; avoid team leadership claims
  - Senior/Staff/Principal/Lead: May lead projects, mentor, set technical direction
- Each bullet must be specific and substantive: what you built/changed + tech (<b>...</b>) + concrete detail (scope, dataset, feature, performance, users, or measurable outcome). No vague one-liners.
- Include relevant technologies from the JD with <b>...</b> tags inside description bullets only
${
  options.stressIndustryLast2
    ? `- TWO MOST RECENT roles (by employment dates): MUST have 8-10 PLENTY detailed bullets each covering (1) industry/field experience for ${options.industry || 'infer from JD'}, (2) technical delivery, and (3) remote/distributed-team contributions (async collab, timezones, remote delivery). Expand/replace thin existing bullets for those roles.
- OLDER roles: 5-7 technical-only bullets — do NOT mention industry domain experience
- Do NOT change company names for older roles - leave them as provided`
    : `- Each MUST have "descriptions": string[] with 5-8 contentful bullets
- If bullets already exist, you may improve them but keep them non-empty`
}
- Do not change company names or dates

JSON only:
{ "experience": [ { "descriptions": ["...", "..."] } ] }
`;

  const raw =
    provider === 'claude'
      ? await generateWithClaude(prompt, SYSTEM_PROMPT_REPAIR, REPAIR_OUTPUT_SCHEMA, MAX_REPAIR_TOKENS)
      : await generateWithOpenAI(prompt, SYSTEM_PROMPT_REPAIR, MAX_REPAIR_TOKENS);

  const repaired = parseJsonLoose(raw);
  const repairedExperience = Array.isArray(repaired.experience) ? repaired.experience : [];
  const recentIdx = options.stressIndustryLast2
    ? new Set(mostRecentIndices(experience, 2))
    : new Set<number>();

  const mergedExperience = experience.map((exp: any, index: number) => {
    const existing = normalizeDescriptions(exp);
    const repairedDescs = normalizeDescriptions(repairedExperience[index]);
    let descriptions = existing;
    if (!existing.length) {
      descriptions = repairedDescs;
    } else if (recentIdx.has(index) && repairedDescs.length >= 8 && repairedDescs.length >= existing.length) {
      // Prefer enriched plenty bullets for the two most recent roles
      descriptions = repairedDescs;
    } else if (recentIdx.has(index) && existing.length < 8 && repairedDescs.length > existing.length) {
      descriptions = repairedDescs;
    }
    return {
      ...exp,
      descriptions,
    };
  });

  return { ...parsed, experience: mergedExperience };
}

async function pickSubstituteCompanies(
  profile: any,
  jobDescription: string,
  provider: AIProvider
): Promise<CompanyPickResult> {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const recent = experience.slice(0, 2);
  const needed = Math.min(2, Math.max(1, recent.length));

  const attempt = async (extraGuard: string): Promise<CompanyPickResult> => {
    const prompt = `
From this job description, identify the hiring company and its industry/field.

IMPORTANT: Infer industry ONLY from the JOB DESCRIPTION / hiring company - ignore the candidate's past employers when deciding industry.

Propose exactly ${needed} REAL mid-sized, lesser-known companies in that SAME industry (from the JD) for the candidate's most recent employer(s).

SIZE & FAME RULES (STRICT):
- Prefer roughly 50-500 employees / niche mid-market firms
- Prefer obscure / regional / lesser-known companies
- DO NOT use FAANG, Big Tech, Fortune 500 household names, mega insurers, or mega EHR vendors (Epic, Oracle Health/Cerner, Optum, UnitedHealth, Google, Amazon, Microsoft, Apple, Meta, IBM, Salesforce, etc.)
- DO NOT use the target hiring company itself
- Real company names only; include plausible HQ city

RELATIONSHIP RULES (STRICT — MOST IMPORTANT):
- Substitutes must have NO relationship with the hiring/target company
- Forbidden relationships include: partners, customers, clients, vendors, suppliers, subsidiaries, parent companies, sister brands, affiliates, contractors, resellers, integrators, investors, portfolio companies, acquisitions, spin-offs, joint ventures, or any company named/mentioned in the JD as a customer/partner/user
- The ONLY acceptable relationship is being a direct rival/competitor in the same market
- First replacement = preferably a lesser-known mid-market rival of the hiring company
- Second = a different company that is either another rival OR a completely unrelated mid-sized peer in the same industry (still no partnership/customer/vendor ties)
- If unsure whether a company is related to the hiring company, do NOT use it — pick a clearly independent peer instead
${extraGuard}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CURRENT MOST RECENT EMPLOYERS (replace these):
${recent.map((exp: any, i: number) => `${i + 1}. ${exp.company || 'Unknown'} - ${exp.position || ''}`).join('\n')}

Return ONLY JSON:
{
  "targetCompany": "hiring company from the JD",
  "industry": "short industry/field label",
  "replacements": [
    { "company": "Independent mid-sized rival or unrelated peer", "address": "City, State" }
  ]
}
`;

    const raw =
      provider === 'claude'
        ? await generateWithClaude(prompt, SYSTEM_PROMPT_COMPANY_PICK, COMPANY_PICK_SCHEMA, MAX_COMPANY_PICK_TOKENS)
        : await generateWithOpenAI(prompt, SYSTEM_PROMPT_COMPANY_PICK, MAX_COMPANY_PICK_TOKENS);

    const parsed = parseJsonLoose(raw) as CompanyPickResult;
    const targetCompany = String(parsed.targetCompany || '').trim();
    const replacements = (parsed.replacements || [])
      .slice(0, needed)
      .map((r) => ({
        company: String(r?.company || '').trim(),
        address: String(r?.address || '').trim(),
      }))
      .filter((r) => r.company);

    if (replacements.length < needed) {
      throw new Error(`Expected ${needed} company replacements, got ${replacements.length}`);
    }

    return {
      targetCompany,
      industry: String(parsed.industry || ''),
      replacements,
    };
  };

  let result = await attempt('');
  const rejected = replacementsRelatedToTarget(result, jobDescription);
  if (rejected.length) {
    console.warn('Rejected related substitute companies:', rejected.join(', '));
    result = await attempt(
      `\nRETRY GUARD: Do NOT use these rejected companies (related or named in the JD): ${rejected.join(', ')}. Pick different independent rivals/peers.`
    );
    const stillBad = replacementsRelatedToTarget(result, jobDescription);
    if (stillBad.length) {
      throw new Error(
        `Substitute companies still related to the hiring company or named in the JD: ${stillBad.join(', ')}`
      );
    }
  }

  return result;
}

/** True if a proposed substitute looks related to the hiring company / appears in the JD. */
function replacementsRelatedToTarget(
  pick: CompanyPickResult,
  jobDescription: string
): string[] {
  const target = (pick.targetCompany || '').trim();
  const jd = jobDescription || '';
  const bad: string[] = [];

  for (const r of pick.replacements || []) {
    const company = (r.company || '').trim();
    if (!company) continue;

    if (target && company.toLowerCase() === target.toLowerCase()) {
      bad.push(company);
      continue;
    }
    if (target && companyNamesOverlap(company, target)) {
      bad.push(company);
      continue;
    }
    // Companies named in the JD are usually customers/partners/examples — not allowed as substitutes.
    // (Direct rivals are almost never listed that way in a posting.)
    if (companyMentionedInText(company, jd)) {
      bad.push(company);
    }
  }

  return [...new Set(bad)];
}

function companyMentionedInText(company: string, text: string): boolean {
  if (!company || company.length < 3 || !text) return false;
  const escaped = company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

function companyNamesOverlap(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|technologies|technology|labs|lab)\b\.?/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

async function generateWithOpenAI(
  prompt: string,
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: maxTokens,
  });

  const content = completion.choices[0]?.message?.content || '';
  if (completion.choices[0]?.finish_reason === 'length') {
    console.warn('OpenAI response truncated due to max_tokens');
  }
  return content;
}

async function generateWithClaude(
  prompt: string,
  systemPrompt: string,
  schema: Record<string, unknown>,
  maxTokens: number
): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema,
      },
    },
  });

  if (message.stop_reason === 'max_tokens') {
    console.warn('Claude response truncated due to max_tokens');
  }

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/** Original main-branch user prompt — used when tailor-company checkbox is OFF. */
const createOriginalAIPrompt = (profile: any, jobDescription: string): string => {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  return `
Please create a highly tailored resume for the following job description. The goal is to position the candidate as an ideal fit for this specific role, even if their original experience doesn't perfectly match.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

ORIGINAL EXPERIENCE (Use as inspiration but don't be limited by it):
${experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || ''}
  Original Description: ${exp.description || ''}
`).join('\n')}

EDUCATION:
${education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${skills.filter((skill: string) => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description thoroughly to identify:
   - Job title and company name
   - Required technical skills and technologies
   - Key responsibilities and duties
   - Industry-specific terminology
   - Desired qualifications and experience level
   - Company culture and values mentioned

2. TRANSFORM each work experience to align with the target role:
   - Adjust job titles to show progression toward the target position
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include specific technologies, tools, and methodologies mentioned in the job description
   - Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write
   - Focus on transferable skills that apply to the target role
   - Use industry-specific language and terminology from the job description
   - Match bullet seniority to that role's title: Junior/entry roles contribute/implement/build — never Led/Owned architecture/Mentored; Senior roles may lead
   - Make each bullet contentful: action + what changed + tech + concrete detail (scope, feature, or measurable outcome) — avoid vague one-liners

3. CREATIVE TAILORING APPROACH:
   - If the job requires specific technologies (e.g., Ruby on Rails), incorporate those technologies into relevant work experiences
   - Emphasize similar frameworks, methodologies, or problem-solving approaches
   - Avoid examples that are too close to the job's tech stack because it'll be obvious AI generated it.
   - Highlight leadership, project management, and collaboration skills that are universally valuable
   - Show how past experiences demonstrate the ability to learn and adapt to new technologies
   - Create bullet points that showcase the candidate's potential to excel in the target role

4. JOB TITLE STRATEGY:
   - Most recent position: Make it closely match or be one step below the target job title
   - Previous positions: Show clear career progression toward the target role
   - Use industry-standard titles that align with the target position
   - Keep company names exactly as provided

Please provide the following in JSON format:

1. Extract the job title and company name from the job description
${JOB_TITLE_EXTRACTION_INSTRUCTIONS}
2. A compelling professional summary that positions the candidate for this specific role
3. Enhanced work experience with 7-12 bullet points per position that:
   - Are specifically tailored to the job description requirements
   - Include relevant technologies, tools, and methodologies from the job description
   - Show quantifiable achievements and measurable impact
   - Demonstrate transferable skills and adaptability
   - Use action verbs and industry-specific terminology from the job description
   - Vary bullet point count based on role complexity and duration
4. Enhanced skills list that includes both current skills and skills mentioned in the job description

5. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - In every experience bullet point, wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b> tags
   - Examples: <b>React</b>, <b>Node.js</b>, <b>PostgreSQL</b>, <b>AWS</b>, <b>Docker</b>, <b>CI/CD</b>, <b>TypeScript</b>
   - Only wrap the skill/technology token itself — not entire sentences
   - Do not bold soft skills or generic words
   - Keep the <b> tags inside the JSON string values (valid JSON)

EXAMPLE OF TAILORING:
If applying for "Ruby on Rails Developer" and original experience was in "Web Development":
- Adjust title to "Ruby on Rails Developer"
- Include bullet points about web development, database management, API development
- Emphasize experience with similar frameworks (if any) or rapid learning abilities
- Highlight problem-solving, debugging, and software development lifecycle experience, and Ruby on Rails experience

IMPORTANT JSON FORMATTING RULES:
- Respond with ONLY valid JSON - no markdown code blocks, no extra text
- Ensure you do not remove any original company names or job titles. The generated number of positions should be the same as the original experience.
- Must follow the response format exactly.

Response format:
{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Tailored Job Title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Built scalable APIs with <b>Node.js</b> and <b>TypeScript</b> on <b>AWS</b>...",
        "Led frontend delivery using <b>React</b> and <b>Next.js</b>...",
        "Optimized <b>PostgreSQL</b> queries and improved system reliability...",
        "Technical accomplishment using relevant technologies or methodologies...",
        "Leadership or collaboration experience valuable for the target position...",
        "Problem-solving or innovation that shows adaptability...",
        "Project management or delivery experience relevant to target role...",
        "Cross-functional collaboration demonstrating team skills...",
        "Process improvement or optimization relevant to target position...",
        "Strategic thinking or planning experience valuable for the role...",
        "Measurable outcome that demonstrates impact and results...",
        "Technical expertise or specialization relevant to target position..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};

/** Tailor-company mode user prompt — used when checkbox is ON. */
const createTailorCompanyAIPrompt = (
  profile: any,
  jobDescription: string,
  industry: string
): string => {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  return `
Create a tailored resume JSON for this job.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Summary: ${profile.summary || ''}

ORIGINAL EXPERIENCE (keep company names/addresses exactly as listed — two most recent may already be substituted peers):
${experience
  .map(
    (exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || ''}
  Notes: ${exp.description || ''}
`
  )
  .join('\n')}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

SKILLS:
${skills.filter((skill: string) => skill.trim()).join(', ')}

INSTRUCTIONS:
1. Extract jobTitle and companyName from the JD
${JOB_TITLE_EXTRACTION_INSTRUCTIONS}
2. Write a tailored summary
3. For EACH of the ${experience.length} roles, write contentful bullet points in "descriptions" (array of strings). NEVER leave descriptions empty. NEVER use singular "description".
   - TWO MOST RECENT roles: write 8-10 PLENTY, detailed bullets each (longer sentences OK). Must include:
     (a) industry/field experience for ${industry || 'the JD industry'} — domain workflows, business problems, regulations/compliance if relevant, industry terminology
     (b) technical delivery with <b>...</b> skills
     (c) remote/distributed work — async collaboration, timezone coordination, remote code review, Slack/Teams/Zoom rituals, shipping without co-location, documenting for remote teammates, pairing across locations
     At least 2 bullets per recent role should explicitly show remote-work contribution; at least 3 should show industry/field impact
   - OLDER roles: write 5-7 technical-focused bullets (no industry domain emphasis)
   - Each bullet must be specific: action + what was built/changed + technologies with <b>...</b> + concrete detail (scope, feature, data volume, latency, users, accuracy, or other measurable outcome when plausible)
   - Cover different facets of the work — not repetitive generic lines
   - Avoid vague filler ("worked on projects", "helped the team", "used various tools")
4. In experience bullet "descriptions" only, wrap tech skills with <b>...</b> tags (e.g. <b>React</b>). Do NOT put <b> tags in the skills array, summary, jobTitle, companyName, or position fields.
5. skills must be a flat array of plain skill name strings with NO HTML/markup (e.g. ["Node.js", "TypeScript"] not ["<b>Node.js</b>"])

6. ROLE TITLES — EVERY COMPANY IN CAREER HISTORY (REQUIRED):
   - Rewrite "position" for EVERY experience entry — never keep profile titles
   - Grow junior → senior by employment dates (aligned to the JD title):
     - Chronologically FIRST / oldest company = Junior-level title
     - Middle companies = Associate / mid-level titles
     - Chronologically LAST / newest company = Senior-level title matching the JD
   - Example for JD "Senior Software Engineer, Android" with 4 jobs (newest listed first):
     newest → Senior Android Engineer
     next → Android Engineer
     next → Associate Android Engineer
     oldest → Junior Android Engineer
   - Use clean titles only — do NOT append industry/domain phrases
   - COMPANY NAMES: keep EXACTLY as listed in ORIGINAL EXPERIENCE (only the two most recent employers may already be substituted)
   - Keep dates and number of experience entries identical

7. BULLET SENIORITY MUST MATCH THE POSITION AT THAT COMPANY (STRICT):
   - Write bullets appropriate to the title you assign for THAT role — a Junior cannot sound like a tech lead
   - Junior / Jr / Entry-level titles:
     - Use: Developed, Implemented, Built, Contributed, Assisted, Collaborated, Wrote, Debugged, Supported, Integrated, Tested
     - NEVER use: Led, Owned, Architected, Mentored, Directed, Spearheaded, Drove strategy, Set technical direction, Managed a team, Established standards for the org
     - Scope = individual contributor work on features/modules under guidance, not end-to-end ownership of strategy
   - Associate / mid-level titles (no Junior/Senior prefix):
     - Own features or components; collaborate with seniors; improve reliability/performance of your area
     - Avoid org-wide leadership, mentoring programs, or architecture ownership claims
   - Senior / Staff / Principal / Lead titles:
     - May lead delivery, mentor others, drive design decisions, and own technical direction for an area
   - Example BAD for Junior Data Engineer: "Led design and deployment of multi-tenant ML modules..."
   - Example GOOD for Junior Data Engineer: "Implemented data transformation pipelines in <b>Python</b> and <b>PyTorch</b> for classification features, collaborating with senior engineers on deployment and testing"

8. EXPERIENCE FOCUS BY ROLE (STRICT):
   - Industry/field for context: ${industry || 'infer from the job description (NOT from older employers)'}
   - TWO MOST RECENT roles (REQUIRED — make these the richest sections on the resume):
     - Plenty of industry/field experience: domain workflows, regulations, customer/user problems, industry terminology, how the work mattered in that field
     - Plenty of technical depth with <b>...</b>
     - Explicit remote-working contributions: delivering in a remote or hybrid distributed environment (async standups, cross-timezone collaboration, written design docs, remote mentoring/pairing, reliable remote release cadence)
     - Prefer 8-10 bullets; each should read as a full accomplishment, not a short stub
   - ALL OLDER roles (not among the two most recent): stress ONLY technical skills, tools, and engineering work with <b>...</b> — do NOT mention industry domain experience, healthcare/fintech/etc. terminology, or industry-specific workflows; 5-7 bullets is enough
   - Do NOT change company names for older employers

Return ONLY this JSON shape:
{
  "jobTitle": "exact clean job title only, e.g. Senior Android Engineer",
  "companyName": "company name only",
  "summary": "...",
  "experience": [
    {
      "position": "...",
      "company": "EXACT company from ORIGINAL EXPERIENCE",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "...",
      "descriptions": ["bullet 1 with <b>Tech</b>", "bullet 2", "bullet 3", "bullet 4", "bullet 5"]
    }
  ],
  "skills": ["Node.js", "TypeScript", "Python"]
}

CRITICAL: experience length must be ${experience.length}. Every item needs non-empty contentful descriptions[].
CRITICAL: The two most recent roles must have PLENTY of bullets (8-10) covering industry experience AND remote-work contributions.
CRITICAL: Rewrite position titles for EVERY role into a junior→senior ladder from the JD (oldest company=Junior, newest=Senior). Never keep profile titles. Only the two most recent company names may differ from the profile.
CRITICAL: Descriptions for each role must match that role's seniority. Junior roles must never claim leading teams, owning architecture, or mentoring.
`;
};

