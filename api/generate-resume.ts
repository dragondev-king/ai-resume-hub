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

/** Original main-branch system prompt - used when tailor-company checkbox is OFF. */
const SYSTEM_PROMPT_ORIGINAL =
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Your goal is to transform a candidate\'s experience to make them appear as an ideal fit for the target position, even if their original experience doesn\'t perfectly match. Be creative and strategic in highlighting transferable skills, relevant technologies, and adaptable experience. Generate 7-12 bullet points per work experience, with varying counts based on role complexity and duration. Extract a clean professional job title and company name from the job description (e.g. "Senior Android Engineer" or "Senior Software Engineer" — never "Senior Software Engineer, Android"). CRITICAL: Aggressively tailor job titles and experience descriptions to align with the target role while maintaining authenticity and keeping company names unchanged. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>).';

/** Tailor-company mode system prompt - used when checkbox is ON. */
const SYSTEM_PROMPT_TAILOR_COMPANY =
  'You are an expert resume writer. Return ONLY complete valid JSON. Extract jobTitle as ONLY a clean professional job title with no company name, location, or employment-type noise (e.g. "Senior Android Engineer" or "Senior Software Engineer" — never comma specialties like "Senior Software Engineer, Android"). Every experience item MUST include a non-empty "descriptions" array with 5-8 bullet strings. Never omit descriptions. Never use "description" (singular) - always "descriptions" (array of strings). Wrap tech skills with <b>...</b> ONLY inside experience description bullets - never in the skills array, summary, jobTitle, companyName, or position. The skills array must be plain strings only (e.g. "Node.js", not "<b>Node.js</b>"). Rewrite EVERY experience "position" for the target JD into a junior-to-senior career ladder by employment dates. Never reuse the candidate\'s original profile titles. Only the two most recent company names may already be substituted; keep older company names exact.';

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

/** Indices sorted oldest -> newest by start_date. */
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
 * Titles by chronology: oldest company = Junior ... newest company = Senior (JD).
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

/** Force junior->senior titles on EVERY role based on employment dates. */
function applyTitleProgression(parsed: any, jobDescription?: string): any {
  if (!parsed || !Array.isArray(parsed.experience) || parsed.experience.length === 0) {
    return parsed;
  }
  const jobTitle = resolveJobTitle(parsed.jobTitle, parsed.companyName, jobDescription);
  const ladder = buildCareerTitleLadder(jobTitle || String(parsed.jobTitle || ''), parsed.experience);
  return {
    ...parsed,
    jobTitle: jobTitle || parsed.jobTitle || '',
    experience: parsed.experience.map((exp: any, index: number) => ({
      ...exp,
      position: ladder[index] || exp.position,
      descriptions: normalizeDescriptions(exp),
    })),
  };
}

/** Always normalize extracted jobTitle into a clean professional title. */
function finalizeJobTitle(parsed: any, jobDescription?: string): any {
  if (!parsed) return parsed;
  const jobTitle = resolveJobTitle(parsed.jobTitle, parsed.companyName, jobDescription);
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

/** Clean professional job title - strip noise; fold specialties into clean titles (not commas). */
function cleanJobTitle(raw: unknown, companyName?: string): string {
  if (typeof raw !== 'string') return '';
  let title = raw.trim();
  if (!title) return '';

  const noiseToken =
    /^(remote|hybrid|onsite|on-site|full[- ]?time|part[- ]?time|contract|temporary|internship|urgent|hiring|immediately|good match|seniority|senior level|united states|usa|u\.s\.?|atlanta|location|employment type|location type|department|compensation)$/i;
  const platformSpecialty =
    /^(Android|iOS|Backend|Back[- ]?End|Front[- ]?End|Frontend|Full[- ]?Stack|Fullstack|Mobile|Web|Platform|Infrastructure|Security|DevOps|Cloud|Data|Embedded|Firmware|QA|Growth|Payments|Search|Networking|Graphics)$/i;
  const languageSpecialty =
    /^(Kotlin|Java|Swift|Go|Rust|Python|TypeScript|JavaScript|C\+\+|C#|Node\.?js|Ruby|PHP|Scala)$/i;
  const titleRoleWord =
    /\b(engineer|developer|manager|analyst|architect|designer|scientist|consultant|specialist|director|lead|administrator|technician|officer|programmer|sre)\b/i;

  title = title
    .replace(/[\u00b7\u2022]/g, ' | ')
    .replace(/\s+/g, ' ')
    .replace(/^company[- ]?logo\s*/i, '')
    .replace(/^job\s*title\s*[:\-–—]\s*/i, '')
    .replace(/^position\s*[:\-–—]\s*/i, '')
    .trim();

  const segments = title
    .split(/\s*[|/\n]+\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const best = segments
      .map((segment) => {
        let score = 0;
        if (titleRoleWord.test(segment)) score += 5;
        if (/\b(senior|junior|staff|principal|lead|associate|sr\.?|jr\.?)\b/i.test(segment)) score += 2;
        if (noiseToken.test(segment)) score -= 4;
        if (companyName && new RegExp(companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(segment)) {
          score -= 3;
        }
        if (segment.length > 80) score -= 2;
        if (/,/.test(segment)) score -= 1;
        if (/\b(location|compensation|department|overview)\b/i.test(segment)) score -= 5;
        return { segment, score };
      })
      .sort((a, b) => b.score - a.score)[0];
    if (best && best.score > 0) title = best.segment;
  }

  if (companyName && companyName.trim()) {
    const company = companyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    title = title
      .replace(new RegExp(`^${company}\\s*[-–—|/:]?\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[-–—|/]?\\s*${company}\\s*$`, 'i'), '')
      .trim();
  }

  title = title
    .replace(/\s+[-–—]\s+[A-Z][\w.&'"\s-]{1,60}$/g, '')
    .replace(/\s+(?:at|@)\s+[A-Z][\w.&'"\s-]{1,60}$/gi, '')
    .replace(/\s+Location\b.*$/i, '')
    .replace(/\s+Employment Type\b.*$/i, '')
    .replace(/\s+Location Type\b.*$/i, '')
    .replace(/\s+Department\b.*$/i, '')
    .replace(/\s+Compensation\b.*$/i, '')
    .trim();

  if (title.includes(',')) {
    const parts = title.split(',').map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part, index) => {
      if (index === 0) return true;
      if (noiseToken.test(part)) return false;
      if (/^(remote|hybrid|onsite)/i.test(part)) return false;
      if (/\b(atlanta|san francisco|washington|new york|seattle|austin|boston)\b/i.test(part)) {
        return false;
      }
      return part.length <= 40;
    });
    title = kept.join(', ');
  }

  // Fold specialties into clean titles: "Senior Software Engineer, Android" → "Senior Android Engineer"
  {
    let core = title;
    let specialty = '';
    if (title.includes(',')) {
      const parts = title.split(',').map((p) => p.trim()).filter(Boolean);
      core = parts[0] || title;
      specialty = parts.slice(1).join(' ').trim();
    } else {
      const trail = title.match(
        /^(.+?\b(?:Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE))\s+(.+)$/i
      );
      if (trail) {
        const tail = trail[2].trim();
        if (platformSpecialty.test(tail) || languageSpecialty.test(tail)) {
          core = trail[1].trim();
          specialty = tail;
        }
      }
    }

    if (specialty && !noiseToken.test(specialty)) {
      const specialtyHead = specialty.split(/[|/]/)[0].trim();
      const seniorityMatch = core.match(
        /^(Senior|Sr\.?|Staff|Principal|Lead|Junior|Jr\.?|Associate|Mid-Level|Mid Level|Entry[- ]Level)\s+/i
      );
      let seniority = seniorityMatch ? seniorityMatch[1].replace(/\.$/, '') : '';
      if (/^sr\.?$/i.test(seniority)) seniority = 'Senior';
      if (/^jr\.?$/i.test(seniority)) seniority = 'Junior';
      const roleMatch = core.match(
        /\b(Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE)\b/i
      );
      const role = roleMatch ? roleMatch[0] : 'Engineer';

      const canon = (raw: string): string => {
        const key = raw.toLowerCase().replace(/\s+/g, '');
        const map: Record<string, string> = {
          android: 'Android',
          ios: 'iOS',
          backend: 'Backend',
          'back-end': 'Backend',
          frontend: 'Frontend',
          'front-end': 'Frontend',
          fullstack: 'Full Stack',
          'full-stack': 'Full Stack',
          mobile: 'Mobile',
          web: 'Web',
          kotlin: 'Kotlin',
          java: 'Java',
          swift: 'Swift',
          python: 'Python',
          typescript: 'TypeScript',
        };
        return map[key] || raw.charAt(0).toUpperCase() + raw.slice(1);
      };

      if (platformSpecialty.test(specialtyHead) || languageSpecialty.test(specialtyHead)) {
        title = [seniority, canon(specialtyHead), role].filter(Boolean).join(' ');
      } else {
        title = core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
      }
    } else {
      title = core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  title = title
    .replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length > 3 && title === title.toUpperCase()) {
    title = title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return title;
}

/** Prefer a clean professional title from the JD when available. */
function resolveJobTitle(rawAiTitle: unknown, companyName?: string, jobDescription?: string): string {
  const fromAi = cleanJobTitle(rawAiTitle, companyName);
  const fromJd = jobDescription ? extractJobTitleFromDescription(jobDescription, companyName) : '';
  if (!fromJd) return fromAi;
  if (!fromAi) return fromJd;
  const specific = (t: string) =>
    /\b(Android|iOS|Backend|Frontend|Full Stack|Mobile|Web|Kotlin|Java|Swift|Python|TypeScript)\b/i.test(t) &&
    !/,/.test(t);
  if (specific(fromJd) && !specific(fromAi)) return fromJd;
  if (specific(fromAi) && !specific(fromJd)) return fromAi;
  return fromJd || fromAi;
}

function extractJobTitleFromDescription(jobDescription: string, companyName?: string): string {
  if (!jobDescription?.trim()) return '';
  const titleRoleWord =
    /\b(engineer|developer|manager|analyst|architect|designer|scientist|consultant|specialist|director|lead|administrator|technician|officer|programmer|sre)\b/i;
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 30);

  let best = '';
  let bestScore = 0;
  for (const line of lines) {
    if (line.length < 3 || line.length > 90) continue;
    if (
      /^(location|employment|department|compensation|about|overview|application|powered by|equal opportunity|apply|privacy|benefits|nice to have|what you.?ll need|key responsibilities|the benefits)/i.test(
        line
      )
    ) {
      continue;
    }
    if (companyName && line.toLowerCase() === companyName.trim().toLowerCase()) continue;
    if (!titleRoleWord.test(line) && !/\b(senior|junior|staff|principal|lead|associate)\b/i.test(line)) {
      continue;
    }
    const cleaned = cleanJobTitle(line, companyName);
    if (!cleaned) continue;
    let score = 0;
    if (titleRoleWord.test(cleaned)) score += 5;
    if (/\b(senior|staff|principal|lead)\b/i.test(cleaned)) score += 2;
    if (/\b(Android|iOS|Backend|Frontend)\b/i.test(cleaned)) score += 2;
    if (/,/.test(cleaned)) score -= 2;
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }
  return bestScore > 0 ? best : '';
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

    if (!experienceHasAllDescriptions(parsed.experience)) {
      console.warn('Resume missing bullet points - running repair pass');
      parsed = await repairMissingDescriptions(parsed, profileForGeneration, jd, provider, {
        stressIndustryLast2: shouldTailorCompanies,
        industry: companyPick?.industry || '',
      });
    }

    if (shouldTailorCompanies && companyPick?.replacements?.length) {
      parsed = forceCompaniesOnParsed(parsed, companyPick.replacements, profile);
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
Existing bullets: ${role.existingDescriptions.length ? JSON.stringify(role.existingDescriptions) : '(MISSING - generate 5-8 bullets)'}
`
  )
  .join('\n')}

RULES:
- Return one experience entry per role, same order
- Each MUST have "descriptions": string[] with 5-8 bullets
- If bullets already exist, you may improve them but keep them non-empty
- Include relevant technologies from the JD with <b>...</b> tags inside description bullets only
${
  options.stressIndustryLast2
    ? `- For the two most recent roles only, stress industry/field experience: ${options.industry || 'infer from JD'}
- For all older roles, stress ONLY technical skills - do NOT mention industry domain experience
- Do NOT change company names for older roles - leave them as provided`
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

IMPORTANT: Infer industry ONLY from the JOB DESCRIPTION / hiring company - ignore the candidate's past employers when deciding industry.

Propose exactly ${needed} REAL mid-sized, lesser-known peer companies in that SAME industry (from the JD) for the candidate's most recent employer(s).

SIZE & FAME RULES (STRICT):
- Prefer roughly 50-500 employees / niche mid-market firms
- Prefer obscure / regional / lesser-known companies
- DO NOT use FAANG, Big Tech, Fortune 500 household names, mega insurers, or mega EHR vendors (Epic, Oracle Health/Cerner, Optum, UnitedHealth, Google, Amazon, Microsoft, Apple, Meta, IBM, Salesforce, etc.)
- DO NOT use the target hiring company itself
- First replacement = preferably a lesser-known mid-market rival
- Second = a different mid-sized peer in the same industry
- Real company names only; include plausible HQ city

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CURRENT MOST RECENT EMPLOYERS (replace these):
${recent.map((exp: any, i: number) => `${i + 1}. ${exp.company || 'Unknown'} - ${exp.position || ''}`).join('\n')}

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
   - jobTitle must be a clean professional title only (e.g. "Senior Android Engineer" or "Senior Software Engineer")
   - Convert posted specialties into normal titles: "Senior Software Engineer, Android" → "Senior Android Engineer"
   - Never return comma specialties like "Senior Software Engineer, Android" or glued forms like "Senior Software Engineer Android"
   - Strip company name, location, remote/hybrid, full-time/part-time, seniority badges, match %, and other marketing/UI noise
   - Do NOT return titles like "Senior Java Developer - Chordline Health" or "Senior Java Developer | Remote"
2. Write a tailored summary
3. For EACH of the ${experience.length} roles, write 5-8 bullet points in "descriptions" (array of strings). NEVER leave descriptions empty. NEVER use singular "description".
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

7. EXPERIENCE FOCUS BY ROLE (STRICT):
   - Industry/field for context: ${industry || 'infer from the job description (NOT from older employers)'}
   - TWO MOST RECENT roles only: stress industry-related experience (domain workflows, regulations, business problems, industry terminology) AND technical skills with <b>...</b>
   - ALL OLDER roles (not among the two most recent): stress ONLY technical skills, tools, and engineering work with <b>...</b> — do NOT mention industry domain experience, healthcare/fintech/etc. terminology, or industry-specific workflows
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

CRITICAL: experience length must be ${experience.length}. Every item needs non-empty descriptions[].
CRITICAL: Rewrite position titles for EVERY role into a junior→senior ladder from the JD (oldest company=Junior, newest=Senior). Never keep profile titles. Only the two most recent company names may differ from the profile.
`;
};

