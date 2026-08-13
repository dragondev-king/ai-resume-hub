import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

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

const SYSTEM_PROMPT_RESUME =
  'You are an expert resume writer. Return ONLY complete valid JSON. Every experience item MUST include a non-empty "descriptions" array with 5-8 bullet strings. Never omit descriptions. Never use "description" (singular) — always "descriptions" (array of strings). Wrap tech skills in <b>...</b>.';

const SYSTEM_PROMPT_RESUME_WITH_TITLES =
  `${SYSTEM_PROMPT_RESUME} When role-title tailoring is enabled: rewrite EVERY experience "position" for the target JD. Experience is newest-first — index 0 must be a senior-level title matching the JD; the oldest/last entry must be junior-level; middle roles must show clear progression. Never reuse the candidate's original profile titles.`;

const SYSTEM_PROMPT_COMPANY_PICK =
  'You research mid-market employers. Return ONLY valid JSON with targetCompany, industry, and replacements[]. Prefer real mid-sized lesser-known peers (about 50-500 employees). Never suggest famous giants or the target company itself.';

const SYSTEM_PROMPT_REPAIR =
  'You fill missing resume bullet points. Return ONLY valid JSON: { "experience": [ { "descriptions": ["bullet", ...] } ] } with one entry per input role, each having 5-8 non-empty description strings. Wrap tech skills in <b>...</b>.';

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
  const recentOrdered = mostRecentExperienceIndices(experience, 2);
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

function parseSortDate(value?: string): string {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed || /^present$/i.test(trimmed) || /^current$/i.test(trimmed)) {
    return '9999-12';
  }
  return trimmed.slice(0, 7);
}

/** Indices sorted oldest → newest by start_date. */
function chronologicalExperienceIndices(experience: any[]): number[] {
  return experience
    .map((_, index) => index)
    .sort((a, b) => {
      const startA = parseSortDate(experience[a]?.start_date);
      const startB = parseSortDate(experience[b]?.start_date);
      if (startA !== startB) return startA.localeCompare(startB);
      return parseSortDate(experience[a]?.end_date).localeCompare(
        parseSortDate(experience[b]?.end_date)
      );
    });
}

/** Two most recent role indices, newest first. */
function mostRecentExperienceIndices(experience: any[], count = 2): number[] {
  const chrono = chronologicalExperienceIndices(experience);
  return chrono.slice(-count).reverse();
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
  const recentOrdered = mostRecentExperienceIndices(
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

/**
 * Titles by chronology: oldest company = Junior … newest company = Senior (JD).
 * Returns titles aligned to experience array indices.
 */
function buildCareerTitleLadder(targetTitle: string, experience: any[]): string[] {
  const count = experience.length;
  if (count <= 0) return [];

  const cleaned = (targetTitle || '').trim() || 'Software Engineer';
  const base =
    cleaned
      .replace(
        /^(Senior|Sr\.?|Lead|Principal|Staff|Junior|Jr\.?|Associate|Mid-Level|Mid Level|Entry[- ]Level)\s+/i,
        ''
      )
      .trim() || cleaned;

  const seniorTitle = /^(Senior|Sr\.?|Lead|Principal|Staff)\b/i.test(cleaned)
    ? cleaned
    : `Senior ${base}`;

  const oldestToNewest: string[] = new Array(count);
  if (count === 1) {
    oldestToNewest[0] = seniorTitle;
  } else {
    oldestToNewest[0] = `Junior ${base}`;
    oldestToNewest[count - 1] = seniorTitle;
    for (let step = 1; step < count - 1; step++) {
      if (count === 3) {
        oldestToNewest[step] = base;
      } else if (step === count - 2) {
        oldestToNewest[step] = base;
      } else if (step === 1) {
        oldestToNewest[step] = `Associate ${base}`;
      } else {
        oldestToNewest[step] = base;
      }
    }
  }

  const chrono = chronologicalExperienceIndices(experience);
  const byIndex: string[] = new Array(count);
  chrono.forEach((expIndex, careerStep) => {
    byIndex[expIndex] = oldestToNewest[careerStep];
  });
  return byIndex;
}

/** Force junior→senior titles on EVERY role based on employment dates. */
function applyTitleProgression(parsed: any): any {
  if (!parsed || !Array.isArray(parsed.experience) || parsed.experience.length === 0) {
    return parsed;
  }
  const ladder = buildCareerTitleLadder(String(parsed.jobTitle || ''), parsed.experience);
  return {
    ...parsed,
    experience: parsed.experience.map((exp: any, index: number) => ({
      ...exp,
      position: ladder[index] || exp.position,
      descriptions: normalizeDescriptions(exp),
    })),
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
      .map((line: string) => line.replace(/^\s*[-•*]\s*/, '').trim())
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

function normalizeParsedResume(parsed: any): any {
  if (!parsed || typeof parsed !== 'object') return parsed;
  const experience = Array.isArray(parsed.experience)
    ? parsed.experience.map((exp: any) => ({
        ...exp,
        descriptions: normalizeDescriptions(exp),
      }))
    : [];
  return { ...parsed, experience };
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

    const prompt = createAIPrompt(profileForGeneration, jd, {
      tailorRoleTitles: shouldTailorCompanies,
      stressIndustryLast2: shouldTailorCompanies,
      industry: companyPick?.industry || '',
    });

    let rawResponse =
      provider === 'claude'
        ? await generateWithClaude(
            prompt,
            shouldTailorCompanies ? SYSTEM_PROMPT_RESUME_WITH_TITLES : SYSTEM_PROMPT_RESUME,
            RESUME_OUTPUT_SCHEMA,
            MAX_RESUME_OUTPUT_TOKENS
          )
        : await generateWithOpenAI(
            prompt,
            shouldTailorCompanies ? SYSTEM_PROMPT_RESUME_WITH_TITLES : SYSTEM_PROMPT_RESUME,
            MAX_RESUME_OUTPUT_TOKENS
          );

    if (!rawResponse?.trim()) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details: 'The AI returned an empty response. Please try again.',
      });
    }

    let parsed = normalizeParsedResume(parseJsonLoose(rawResponse));

    if (!experienceHasAllDescriptions(parsed.experience)) {
      console.warn('Resume missing bullet points — running repair pass');
      parsed = await repairMissingDescriptions(parsed, profileForGeneration, jd, provider, {
        stressIndustryLast2: shouldTailorCompanies,
        industry: companyPick?.industry || '',
      });
    }

    if (companyPick?.replacements?.length) {
      parsed = forceCompaniesOnParsed(parsed, companyPick.replacements, profile);
    } else {
      parsed = normalizeParsedResume(parsed);
    }

    // When tailor is on: force JD-based junior→senior title ladder for every role
    if (shouldTailorCompanies) {
      parsed = applyTitleProgression(parsed);
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

  const prompt = `
Fill missing resume bullet points for these roles.

JOB DESCRIPTION:
${jobDescription}

ROLES:
${roles
  .map(
    (role: any) => `
[${role.index}] ${role.position} at ${role.company} (${role.start_date} - ${role.end_date})
Original notes: ${role.originalDescription || '(none)'}
Existing bullets: ${role.existingDescriptions.length ? JSON.stringify(role.existingDescriptions) : '(MISSING — generate 5-8 bullets)'}
`
  )
  .join('\n')}

RULES:
- Return one experience entry per role, same order
- Each MUST have "descriptions": string[] with 5-8 bullets
- If bullets already exist, you may improve them but keep them non-empty
- Include relevant technologies from the JD with <b>...</b> tags
${
  options.stressIndustryLast2
    ? `- For roles [0] and [1] only, stress industry/field experience: ${options.industry || 'infer from JD'}
- Do NOT change company names for roles [2+] — leave them as provided`
    : ''
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

  const mergedExperience = experience.map((exp: any, index: number) => {
    const existing = normalizeDescriptions(exp);
    const repairedDescs = normalizeDescriptions(repairedExperience[index]);
    return {
      ...exp,
      descriptions: existing.length ? existing : repairedDescs,
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
  const prompt = `
From this job description, identify the hiring company and its industry/field.

IMPORTANT: Infer industry ONLY from the JOB DESCRIPTION / hiring company — ignore the candidate's past employers when deciding industry.

Propose exactly ${needed} REAL mid-sized, lesser-known peer companies in that SAME industry (from the JD) for the candidate's most recent employer(s).

SIZE & FAME RULES (STRICT):
- Prefer roughly 50–500 employees / niche mid-market firms
- Prefer obscure / regional / lesser-known companies
- DO NOT use FAANG, Big Tech, Fortune 500 household names, mega insurers, or mega EHR vendors (Epic, Oracle Health/Cerner, Optum, UnitedHealth, Google, Amazon, Microsoft, Apple, Meta, IBM, Salesforce, etc.)
- DO NOT use the target hiring company itself
- First replacement = preferably a lesser-known mid-market rival
- Second = a different mid-sized peer in the same industry
- Real company names only; include plausible HQ city

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CURRENT MOST RECENT EMPLOYERS (replace these):
${recent.map((exp: any, i: number) => `${i + 1}. ${exp.company || 'Unknown'} — ${exp.position || ''}`).join('\n')}

Return ONLY JSON:
{
  "targetCompany": "hiring company from the JD",
  "industry": "short industry/field label",
  "replacements": [
    { "company": "Mid-sized lesser-known peer", "address": "City, State" }
  ]
}
`;

  const raw =
    provider === 'claude'
      ? await generateWithClaude(prompt, SYSTEM_PROMPT_COMPANY_PICK, COMPANY_PICK_SCHEMA, MAX_COMPANY_PICK_TOKENS)
      : await generateWithOpenAI(prompt, SYSTEM_PROMPT_COMPANY_PICK, MAX_COMPANY_PICK_TOKENS);

  const parsed = parseJsonLoose(raw) as CompanyPickResult;
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
    targetCompany: String(parsed.targetCompany || ''),
    industry: String(parsed.industry || ''),
    replacements,
  };
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

const createAIPrompt = (
  profile: any,
  jobDescription: string,
  options: {
    tailorRoleTitles: boolean;
    stressIndustryLast2: boolean;
    industry: string;
  }
): string => {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const { tailorRoleTitles, stressIndustryLast2, industry } = options;

  const roleInstructions = tailorRoleTitles
    ? `
4. ROLE TITLES — EVERY COMPANY IN CAREER HISTORY (REQUIRED):
   - Rewrite "position" for EVERY experience entry — never keep profile titles
   - Grow junior → senior by employment dates (aligned to the JD title):
     - Chronologically FIRST / oldest company = Junior-level title
     - Middle companies = Associate / mid-level titles
     - Chronologically LAST / newest company = Senior-level title matching the JD
   - Example for JD "Senior Java Developer" with 4 jobs (newest listed first):
     newest → Senior Java Developer
     next → Java Developer
     next → Associate Java Developer
     oldest → Junior Java Developer
   - Use clean titles only — do NOT append industry/domain phrases
   - COMPANY NAMES: keep EXACTLY as listed in ORIGINAL EXPERIENCE (only the two most recent employers may already be substituted)
   - Keep dates and number of experience entries identical
`
    : `
4. NAMES:
   - Keep EVERY company name and position EXACTLY as in ORIGINAL EXPERIENCE
   - Keep addresses and dates as provided
`;

  const industryInstructions = stressIndustryLast2
    ? `
5. INDUSTRY FOR THE TWO MOST RECENT COMPANIES ONLY:
   - Industry/field: ${industry || 'infer from the job description (NOT from older employers)'}
   - Put that industry context into MOST bullets for the two most recent roles only
   - Do NOT change company names for older employers
`
    : '';

  return `
Create a tailored resume JSON for this job.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Summary: ${profile.summary || ''}

ORIGINAL EXPERIENCE (keep company names/addresses exactly):
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
2. Write a tailored summary
3. For EACH of the ${experience.length} roles, write 5-8 bullet points in "descriptions" (array of strings). NEVER leave descriptions empty. NEVER use singular "description".
4. Include JD-relevant tech with <b>...</b> tags; keep wording simple
${roleInstructions}${industryInstructions}

Return ONLY this JSON shape:
{
  "jobTitle": "...",
  "companyName": "...",
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
  "skills": ["..."]
}

CRITICAL: experience length must be ${experience.length}. Every item needs non-empty descriptions[].
${
  tailorRoleTitles
    ? 'CRITICAL: Rewrite position titles for EVERY role into a junior→senior ladder from the JD (oldest company=Junior, newest=Senior). Never keep profile titles. Only the two most recent company names may differ from the profile.'
    : ''
}
`;
};