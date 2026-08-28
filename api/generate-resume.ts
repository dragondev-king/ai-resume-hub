import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { normalizeJobTitle, JOB_TITLE_EXTRACTION_INSTRUCTIONS } from './_lib/jobTitlePrompt.js';
import {
  applyCareerTitleProgression,
  mostRecentIndices,
  toneDescriptionsToSeniority,
} from './_lib/careerProgression.js';

type AIProvider = 'openai' | 'claude';

export const config = {
  maxDuration: 300,
};

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

/** Main-branch resume quality (timeline + chronology). Always used for generation. */
const SYSTEM_PROMPT =
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Transform the candidate\'s experience so they look like a strong fit for the target job. Write rich, specific, human bullets a recruiter would believe. Generate 7-12 bullet points per work experience (10-12 for longer or senior roles). Never write thin 4-5 bullet roles. Extract the job title and company name from the job description. Aggressively tailor job titles and descriptions while keeping company names and employment dates unchanged. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b>. Version rule: required job-description versions belong in the most recent company only, once per version; earlier companies and the summary use family names with no version number. Never put a version in a job that ended before that version existed.';

/** Layered on SYSTEM_PROMPT only when profile has company/role tailoring enabled. */
const SYSTEM_PROMPT_TAILOR_EXTRA =
  ' ADVANCED MODE: Company names in the work history may already be substituted peer employers — keep those company names and addresses exactly; do not invent different ones. Rewrite EVERY experience "position" into a junior→senior career ladder by employment dates (oldest role = Junior-level title for the JD; newest = Senior matching the JD). Never keep the candidate\'s original profile titles. For the TWO MOST RECENT roles write 8-10 plentiful bullets covering industry/field experience, technical delivery, AND remote/distributed-team collaboration. Older roles: technical-focused bullets (still aim for 7-12). Bullet tone MUST match each role\'s seniority (Junior never Led/Owned architecture/Mentored).';

const SYSTEM_PROMPT_COMPANY_PICK =
  'You research mid-market employers. Return ONLY valid JSON with targetCompany, industry, and replacements[]. Prefer real mid-sized lesser-known peers (about 50-500 employees) whose headquarters or primary operations are in the candidate\'s country of residence (infer from their home address/location). Never suggest famous giants or the target company itself. CRITICAL: replacements must have NO business relationship with the hiring company (not partners, customers, vendors, subsidiaries, parents, affiliates, investors, portfolio companies, contractors, or companies named in the JD). The ONLY allowed relationship is being a direct rival/competitor.';

const SYSTEM_PROMPT_REPAIR =
  'You fill and enrich resume bullet points. Return ONLY valid JSON: { "experience": [ { "descriptions": ["bullet", ...] } ] } with one entry per input role. For the two most recent roles when asked, write 8-10 plentiful detailed bullets covering industry/field experience, technical delivery, and remote/distributed-team contributions. Older roles: 5-7 technical bullets. Bullet seniority MUST match the role title (Junior never Led/Owned architecture/Mentored). Wrap tech skills in <b>...</b>.';

const TIMELINE_SYSTEM_PROMPT =
  'You map job-description technologies onto a candidate\'s real work history. A specific version must not appear in a job that ended before it existed. Required JD versions belong in mustUse for the MOST RECENT role only. Each version should be named once in that role\'s bullets, then family names only. All earlier roles: family name in mayUse, required version in mustNotUse. Respond with valid JSON only.';

const AUDIT_SYSTEM_PROMPT =
  'You are a light copy editor. Do not rewrite the resume. Do not shorten it. Do not drop bullets or skills. Keep the same dates, companies, bullet count, and skill list length. Only fix version-number placement. Respond with valid JSON only.';

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

const TIMELINE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    technologies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string' },
          introduced: { type: 'string' },
          confidence: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'kind', 'introduced', 'confidence', 'notes'],
        additionalProperties: false,
      },
    },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          mayUse: {
            type: 'array',
            items: { type: 'string' },
          },
          mustUse: {
            type: 'array',
            items: { type: 'string' },
          },
          mustNotUse: {
            type: 'array',
            items: { type: 'string' },
          },
          eraStackGuidance: { type: 'string' },
        },
        required: ['company', 'start_date', 'end_date', 'mayUse', 'mustUse', 'mustNotUse', 'eraStackGuidance'],
        additionalProperties: false,
      },
    },
  },
  required: ['technologies', 'roles'],
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
        start_date: original?.start_date || next.experience[i].start_date,
        end_date: original?.end_date || next.experience[i].end_date,
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
function applyTitleProgression(parsed: any, jobDescription?: string, profileExperience?: any[]): any {
  if (!parsed || !Array.isArray(parsed.experience) || parsed.experience.length === 0) {
    return parsed;
  }
  const jobTitle = normalizeJobTitle(parsed.jobTitle);
  const profileRows = Array.isArray(profileExperience) ? profileExperience : [];
  const normalized = parsed.experience.map((exp: any, index: number) => ({
    ...exp,
    start_date: profileRows[index]?.start_date || exp.start_date || '',
    end_date: profileRows[index]?.end_date || exp.end_date || '',
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

    // Advanced option only: pick peer companies, then run full main pipeline on substituted profile
    if (shouldTailorCompanies) {
      const pickProvider: AIProvider = process.env.OPENAI_API_KEY ? 'openai' : provider;
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

    // Main-branch pipeline for everyone (timeline → draft → chronology audit)
    const today = formatToday();
    const workHistory = formatWorkHistory(profileForGeneration);
    const timeline = await analyzeTechnologyTimeline({
      provider,
      jobDescription: jd,
      workHistory,
      today,
    });
    const draft = await generateResumeDraft({
      provider,
      system: shouldTailorCompanies
        ? SYSTEM_PROMPT + SYSTEM_PROMPT_TAILOR_EXTRA
        : SYSTEM_PROMPT,
      prompt: createAIPrompt(profileForGeneration, jd, timeline, today, workHistory, {
        tailorCompanyNames: shouldTailorCompanies,
        industry: companyPick?.industry || '',
      }),
    });
    const rawResponse = await auditResumeChronology({
      provider,
      draft,
      timeline,
      workHistory,
      jobDescription: jd,
      today,
    });

    if (!rawResponse?.trim()) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details: 'The AI returned an empty response. Please try again.',
      });
    }

    // Unchecked = main-branch response shape (raw audited JSON, no tailor post-processing)
    if (!shouldTailorCompanies) {
      const parsedCheck = normalizeParsedResume(parseJsonLoose(rawResponse));
      if (!experienceHasAllDescriptions(parsedCheck.experience)) {
        return res.status(502).json({
          error: 'Failed to generate resume',
          details:
            'The AI did not return experience bullet points. Please try again with a shorter job description.',
        });
      }
      return res.status(200).json({
        success: true,
        aiResponse: rawResponse,
        provider,
        companyPick: null,
      });
    }

    // Checked = main pipeline output + company/role advanced post-processing
    let parsed = normalizeParsedResume(parseJsonLoose(rawResponse));
    parsed = finalizeJobTitle(parsed, jd);

    if (companyPick?.replacements?.length) {
      const needsRepair =
        !experienceHasAllDescriptions(parsed.experience) ||
        experienceRecentRolesNeedEnrichment(parsed.experience, 8);

      if (needsRepair) {
        console.warn('Resume missing or thin bullet points - running repair/enrich pass');
        parsed = await repairMissingDescriptions(parsed, profileForGeneration, jd, provider, {
          stressIndustryLast2: true,
          industry: companyPick.industry || '',
        });
      }

      parsed = forceCompaniesOnParsed(parsed, companyPick.replacements, profile);
      parsed = applyTitleProgression(parsed, jd, profile.experience);
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

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatRoleEnd(exp: any): string {
  if (exp.current || !exp.end_date || String(exp.end_date).toLowerCase() === 'present') {
    return 'Present';
  }
  return String(exp.end_date);
}

function formatWorkHistory(profile: any): string {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  return experience
    .map((exp: any, index: number) => {
      const end = formatRoleEnd(exp);
      return `${index + 1}. ${exp.position} at ${exp.company}
   Dates (FACT — do not change): ${exp.start_date} through ${end}
   Address: ${exp.address || ''}
   Original description: ${exp.description || ''}`;
    })
    .join('\n');
}

async function analyzeTechnologyTimeline(params: {
  provider: AIProvider;
  jobDescription: string;
  workHistory: string;
  today: string;
}): Promise<string> {
  const prompt = `TODAY'S DATE: ${params.today}

JOB DESCRIPTION:
${params.jobDescription}

CANDIDATE WORK HISTORY (dates are facts):
${params.workHistory}

Build a chronology map. Required job-description versions may be named in the MOST RECENT role only.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description. Use whatever names and versions the JD actually lists.
2. For each, estimate when it first became available (YYYY-MM).
3. Distinguish family names from versions. "<Family>" is not "<Family> <Version>".
4. Identify the most recent work-history role (latest end date, or Present).
5. For each role, list:
   - mayUse: family names that existed during that role — not version numbers, except as below
   - mustUse: required JD versions for the MOST RECENT role only, and only if that role was still active after the version shipped. Empty for every earlier role.
   - mustNotUse: required JD versions for every role except that one most-recent eligible role
   - eraStackGuidance: most recent eligible role should name each required version once in the whole bullet list; remaining bullets and all other roles use the family name with no version number
6. If the most recent role ended before the version existed, mustUse is empty everywhere. Do not assign the version to an older company.

Respond with ONLY JSON using the REAL company names and dates from the work history above, and the REAL technologies from the job description. The following is the shape only — copy structure, not these placeholders:

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required by the JD. Name it only in the most recent role if that role was still active after introduced."
    }
  ],
  "roles": [
    {
      "company": "<most recent company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family>", "<Family> <Version>"],
      "mustUse": ["<Family> <Version>"],
      "mustNotUse": [],
      "eraStackGuidance": "Most recent role and dates allow the required version. This is the ONLY role that should name it."
    },
    {
      "company": "<earlier company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family>"],
      "mustUse": [],
      "mustNotUse": ["<Family> <Version>"],
      "eraStackGuidance": "Write the family name only. No version numbers."
    }
  ]
}`;

  try {
    if (params.provider === 'claude') {
      return await generateWithClaude({
        prompt,
        system: TIMELINE_SYSTEM_PROMPT,
        schema: TIMELINE_OUTPUT_SCHEMA,
        maxTokens: 4000,
      });
    }

    return await generateWithOpenAI({
      prompt,
      system: TIMELINE_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 4000,
    });
  } catch (error) {
    console.error('Technology timeline analysis failed; continuing with prompt-only chronology rules:', error);
    return '';
  }
}

async function generateResumeDraft(params: {
  provider: AIProvider;
  prompt: string;
  system?: string;
}): Promise<string> {
  const system = params.system || SYSTEM_PROMPT;
  if (params.provider === 'claude') {
    return generateWithClaude({
      prompt: params.prompt,
      system,
      schema: RESUME_OUTPUT_SCHEMA,
      maxTokens: MAX_RESUME_OUTPUT_TOKENS,
    });
  }

  return generateWithOpenAI({
    prompt: params.prompt,
    system,
    temperature: 0.7,
    maxTokens: MAX_RESUME_OUTPUT_TOKENS,
  });
}

async function auditResumeChronology(params: {
  provider: AIProvider;
  draft: string;
  timeline: string;
  workHistory: string;
  jobDescription: string;
  today: string;
}): Promise<string> {
  const prompt = `TODAY'S DATE: ${params.today}

JOB DESCRIPTION (for tailoring context, not for copying into old jobs):
${params.jobDescription}

FACTUAL WORK HISTORY DATES:
${params.workHistory}

TECHNOLOGY TIMELINE (follow this):
${params.timeline || 'Required JD versions may be named in the most recent company only, and only if that role was still active after the version shipped. Summary: family names only, no versions. Earlier jobs: family names, no version numbers.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT AND REWRITE:
This is a surgical edit, not a rewrite. Quality of the draft must stay the same or improve.

1. Keep the same companies, start/end dates, addresses, positions, number of roles, and JSON shape.
2. Keep EVERY bullet. Do not delete bullets. Do not merge bullets. If a role has 8 bullets, it still has 8. Prefer 7-12 per role; if a role is already under 7, leave the count as-is unless you can add substance without inventing new employers.
3. Keep the full skills list. Add missing job-description skills if needed. Never shrink a long list down to only a few JD keywords.
4. Professional summary: keep length and strength. Remove version numbers only (Family Version → Family). Do not make the summary shorter or generic.
5. Experience versions: a required version from THIS job description may appear only in the most recent company, once per version. Other bullets at that company use the family name. Earlier companies: family name, no version number. Do not strip other technologies, tools, or details.
6. Do not change employment dates.
7. Keep <b>...</b> around tech tokens. Sound human. No "scalability"/"reliability"/"robust".

Respond with ONLY the corrected resume JSON in this shape:
{
  "jobTitle": "...",
  "companyName": "...",
  "summary": "...",
  "experience": [
    {
      "position": "...",
      "company": "...",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "...",
      "descriptions": ["..."]
    }
  ],
  "skills": ["..."]
}`;

  try {
    if (params.provider === 'claude') {
      return await generateWithClaude({
        prompt,
        system: AUDIT_SYSTEM_PROMPT,
        schema: RESUME_OUTPUT_SCHEMA,
        maxTokens: MAX_RESUME_OUTPUT_TOKENS,
      });
    }

    return await generateWithOpenAI({
      prompt,
      system: AUDIT_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: MAX_RESUME_OUTPUT_TOKENS,
    });
  } catch (error) {
    console.error('Chronology audit failed; returning draft resume:', error);
    return params.draft;
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
      ? await generateWithClaude({
          prompt,
          system: SYSTEM_PROMPT_REPAIR,
          schema: REPAIR_OUTPUT_SCHEMA,
          maxTokens: MAX_REPAIR_TOKENS,
        })
      : await generateWithOpenAI({
          prompt,
          system: SYSTEM_PROMPT_REPAIR,
          temperature: 0.7,
          maxTokens: MAX_REPAIR_TOKENS,
        });

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

function describeCandidateResidence(profile: any): string {
  const location = String(profile?.location || '').trim();
  if (!location) return '';
  return location;
}

async function pickSubstituteCompanies(
  profile: any,
  jobDescription: string,
  provider: AIProvider
): Promise<CompanyPickResult> {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const recentOrdered = mostRecentIndices(experience, 2);
  const recent = recentOrdered.map((i) => experience[i]).filter(Boolean);
  const needed = Math.min(2, Math.max(1, recent.length));
  const homeAddress = describeCandidateResidence(profile);

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
- Real company names only; include a plausible HQ / office address in the candidate's country of residence

COUNTRY OF RESIDENCE RULES (STRICT — REQUIRED):
- Infer the candidate's country of residence from their HOME ADDRESS / location below
- Every proposed substitute company MUST be headquartered in, or primarily based in, that SAME country
- Prefer companies with offices in the same country (and when possible the same region/metro) as the home address
- Do NOT pick companies primarily based in a different country, even if they are industry peers
- Each replacement "address" must be a real city/region INSIDE that country of residence (not abroad)
${homeAddress ? `- Candidate home address / location: ${homeAddress}` : '- Candidate home address was not provided; infer country from any location clues in the profile, otherwise prefer US mid-market peers'}

RELATIONSHIP RULES (STRICT — MOST IMPORTANT):
- Substitutes must have NO relationship with the hiring/target company
- Forbidden relationships include: partners, customers, clients, vendors, suppliers, subsidiaries, parent companies, sister brands, affiliates, contractors, resellers, integrators, investors, portfolio companies, acquisitions, spin-offs, joint ventures, or any company named/mentioned in the JD as a customer/partner/user
- The ONLY acceptable relationship is being a direct rival/competitor in the same market
- First replacement = preferably a lesser-known mid-market rival of the hiring company (still in the candidate's country)
- Second = a different company that is either another rival OR a completely unrelated mid-sized peer in the same industry (still no partnership/customer/vendor ties; still in the candidate's country)
- If unsure whether a company is related to the hiring company, do NOT use it — pick a clearly independent peer instead
${extraGuard}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE HOME ADDRESS / LOCATION (use this to decide country of residence):
${homeAddress || '(not provided)'}

CANDIDATE CURRENT MOST RECENT EMPLOYERS (replace these):
${recent.map((exp: any, i: number) => `${i + 1}. ${exp.company || 'Unknown'} - ${exp.position || ''}`).join('\n')}

Return ONLY JSON:
{
  "targetCompany": "hiring company from the JD",
  "industry": "short industry/field label",
  "replacements": [
    { "company": "Independent mid-sized rival or unrelated peer in candidate's country", "address": "City, State/Region, Country" }
  ]
}
`;

    const raw =
      provider === 'claude'
        ? await generateWithClaude({
            prompt,
            system: SYSTEM_PROMPT_COMPANY_PICK,
            schema: COMPANY_PICK_SCHEMA,
            maxTokens: MAX_COMPANY_PICK_TOKENS,
          })
        : await generateWithOpenAI({
            prompt,
            system: SYSTEM_PROMPT_COMPANY_PICK,
            temperature: 0.7,
            maxTokens: MAX_COMPANY_PICK_TOKENS,
          });

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
      `\nRETRY GUARD: Do NOT use these rejected companies (related or named in the JD): ${rejected.join(', ')}. Pick different independent rivals/peers that are still based in the candidate's country of residence (${homeAddress || 'from home address'}).`
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

async function generateWithOpenAI(params: {
  prompt: string;
  system: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: params.temperature,
    max_completion_tokens: params.maxTokens,
  });

  const content = completion.choices[0]?.message?.content || '';
  if (completion.choices[0]?.finish_reason === 'length') {
    console.warn('OpenAI response truncated due to max_tokens');
  }
  return content;
}

async function generateWithClaude(params: {
  prompt: string;
  system: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: params.maxTokens,
    system: params.system,
    messages: [{ role: 'user', content: params.prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: params.schema,
      },
    },
  });

  if (message.stop_reason === 'max_tokens') {
    console.warn('Claude response truncated due to max_tokens');
  }

  return extractClaudeTextContent(message);
}

function extractClaudeTextContent(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

const createAIPrompt = (
  profile: any,
  jobDescription: string,
  timeline: string,
  today: string,
  workHistory: string,
  options: { tailorCompanyNames?: boolean; industry?: string } = {}
): string => {
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const tailorExtras = options.tailorCompanyNames
    ? `
9. ADVANCED — COMPANY & ROLE TAILORING (ENABLED):
   - Company names/addresses in WORK HISTORY are already the intended employers (two most recent may be mid-sized industry peers). Copy them EXACTLY — do not change them back.
   - Rewrite EVERY "position" into a junior→senior ladder by employment dates aligned to the JD:
     oldest company = Junior-level title; middle = Associate/mid; newest = Senior matching the JD
   - Never keep the candidate's original profile titles
   - TWO MOST RECENT roles: 8-10 plentiful bullets covering (a) industry/field experience for ${options.industry || 'the JD industry'}, (b) technical delivery with <b>...</b>, (c) remote/distributed-team contributions
   - OLDER roles: technical-focused bullets (still follow the 7-12 bullet rule); do not emphasize industry domain for older employers
   - Bullet seniority must match that role's title (Junior never Led/Owned architecture/Mentored)
`
    : '';

  return `
Please create a highly tailored, professional resume for the following job. Position the candidate as an ideal fit. Writing quality matters as much as chronological honesty: rich bullets, full skill list, strong summary.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates and companies are FACTS — copy start_date and end_date exactly):
${workHistory}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

CURRENT SKILLS (keep these; add JD skills; do not replace this list with only a few keywords):
${skills.filter((skill: string) => skill.trim()).join(', ')}

VERSION MAP (placement only — do not use this to shrink the resume):
${timeline || 'Required JD versions: name them once in the most recent company if that role was still active after the version shipped. Summary and earlier jobs: family name only.'}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description for title, company, required skills, responsibilities, and terminology.

2. TRANSFORM each work experience to align with the target role:
   - Adjust job titles to show progression toward the target position
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include specific technologies, tools, and methodologies from the job description and from the original experience
   - Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write
   - Focus on transferable skills that apply to the target role
   - Use industry-specific language from the job description
   - Show quantifiable achievements and measurable impact where it still sounds human
   - Use action verbs. Vary the work: features, integrations, collaboration, testing, performance, mentoring, delivery

3. BULLET COUNT (REQUIRED):
   - 7-12 bullets per position. Senior or longer roles: 10-12. Never output 4-5 bullets for a role.
   - Each bullet should be a full accomplishment, not a three-word stub.

4. CREATIVE TAILORING:
   - Incorporate job-description technologies into relevant work, following the version map below
   - Emphasize similar frameworks, methodologies, and problem-solving
   - Highlight leadership, collaboration, and delivery
   - Show the ability to learn and adapt without sounding like keyword stuffing

5. VERSION RULES (do not let these make the resume thin):
   - Pull technologies from THIS job description and from the original experience. Do not invent a default stack.
   - Summary: family names only, no version numbers. Keep it 4-6 strong sentences, not two generic lines.
   - Most recent company: each required JD version appears ONCE in the bullet list; later bullets use the family name. Other skills (TypeScript, TailwindCSS, APIs, tests, etc.) can appear throughout.
   - Earlier companies: family names for those JD technologies, no version numbers. Keep the rest of the original/relevant stack when it belongs to that job.
   - Never put a version in a job that ended before that version existed
   - Keep company names and original start/end dates. Same number of positions as the original history

6. JOB TITLE STRATEGY:
   - Most recent position: closely match or sit one step below the target title
   - Previous positions: clear career progression
   - Keep company names exactly as provided

7. SKILLS LIST (REQUIRED):
   - Start from CURRENT SKILLS above. Keep them.
   - Add skills mentioned in the job description, including required versions for keyword match
   - The result should look like a senior engineer's skill section, not five keywords

8. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - Wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b>
   - Only wrap the token — not entire sentences. Do not bold soft skills
   - Keep the <b> tags inside JSON string values
${tailorExtras}
Respond with ONLY valid JSON — no markdown, no extra text. Do not drop companies. Same number of positions as original experience.

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
        "Shipped a new feature in the lead-generation app using <b>Skill</b> and <b>Skill</b>...",
        "Integrated APIs and backend services with <b>Skill</b>...",
        "Improved UI consistency with <b>Skill</b> and cut load time by 30%..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};

