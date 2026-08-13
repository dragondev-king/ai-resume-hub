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
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Your goal is to transform a candidate\'s experience to make them appear as an ideal fit for the target position, even if their original experience doesn\'t perfectly match. Be creative and strategic in highlighting transferable skills, relevant technologies, and adaptable experience. Generate 7-12 bullet points per work experience, with varying counts based on role complexity and duration. Extract a clean professional job title from the posted JD header (e.g. "Senior JavaScript Developer" — never body prose like "As a Senior Frontend Developer (React.js…"). CRITICAL: Aggressively tailor job titles and experience descriptions to align with the target role while maintaining authenticity and keeping company names unchanged. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>).';

/** Tailor-company mode system prompt - used when checkbox is ON. */
const SYSTEM_PROMPT_TAILOR_COMPANY =
  'You are an expert resume writer. Return ONLY complete valid JSON. Extract jobTitle as ONLY a clean professional job title from the posted JD header (e.g. "Senior JavaScript Developer" from "Senior Javascript Developer - React"). NEVER use body prose like "As a Senior Frontend Developer (React.js…". Never return incomplete titles with leftover parentheses. Never use comma specialties like "Senior Software Engineer, Android". Every experience item MUST include a non-empty "descriptions" array. The TWO MOST RECENT roles need PLENTY of content: 8-10 long, detailed bullets each covering industry/field experience, technical delivery, AND remote/distributed-team collaboration. Older roles: 5-7 technical-focused bullets. Bullet tone MUST match that role\'s seniority: Junior/entry roles must NOT lead teams, own architecture, or mentor; use contribute/implement/build language. Mid roles own features; Senior roles may lead and mentor. Never omit descriptions. Never use "description" (singular) - always "descriptions" (array of strings). Wrap tech skills with <b>...</b> ONLY inside experience description bullets - never in the skills array, summary, jobTitle, companyName, or position. The skills array must be plain strings only (e.g. "Node.js", not "<b>Node.js</b>"). Rewrite EVERY experience "position" for the target JD into a junior-to-senior career ladder by employment dates. Never reuse the candidate\'s original profile titles. Only the two most recent company names may already be substituted; keep older company names exact.';

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
    experience: parsed.experience.map((exp: any, index: number) => {
      const position = ladder[index] || exp.position;
      const descriptions = toneDescriptionsForTitle(position, normalizeDescriptions(exp));
      return {
        ...exp,
        position,
        descriptions,
      };
    }),
  };
}

/** Soften leadership claims that don't fit Junior / early-career titles. */
function toneDescriptionsForTitle(position: string, descriptions: string[]): string[] {
  const title = String(position || '');
  if (!descriptions.length) return descriptions;

  if (/\b(Junior|Jr\.?|Entry[- ]Level|Intern)\b/i.test(title)) {
    return descriptions.map((line) => softenJuniorBullet(String(line || '')));
  }

  if (
    /\b(Associate|Mid-Level|Mid Level)\b/i.test(title) ||
    !/\b(Senior|Staff|Principal|Lead)\b/i.test(title)
  ) {
    return descriptions.map((line) => softenMidBullet(String(line || '')));
  }

  return descriptions;
}

function softenJuniorBullet(line: string): string {
  const openers: Array<[RegExp, string]> = [
    [/^Led design and deployment of/i, 'Helped implement'],
    [/^Led the design of/i, 'Contributed to the design of'],
    [/^Led design of/i, 'Contributed to design of'],
    [/^Led development of/i, 'Built'],
    [/^Led the development of/i, 'Built'],
    [/^Led deployment of/i, 'Supported deployment of'],
    [/^Led\b/i, 'Contributed to'],
    [/^Owned\b/i, 'Worked on'],
    [/^Architected\b/i, 'Implemented'],
    [/^Mentored\b/i, 'Collaborated with'],
    [/^Directed\b/i, 'Assisted with'],
    [/^Spearheaded\b/i, 'Contributed to'],
    [/^Drove\b/i, 'Supported'],
    [/^Established\b/i, 'Helped establish'],
    [/^Set technical direction\b/i, 'Followed technical guidance for'],
    [/^Managed a team\b/i, 'Collaborated with teammates on'],
    [/^Managed the team\b/i, 'Collaborated with teammates on'],
  ];
  let next = line.trim();
  for (const [pattern, replacement] of openers) {
    if (pattern.test(next)) {
      next = next.replace(pattern, replacement);
      break;
    }
  }
  return next.replace(/^\s*[a-z]/, (c) => c.toUpperCase());
}

function softenMidBullet(line: string): string {
  let next = line.trim();
  next = next
    .replace(/^Mentored (?:a |the )?team\b/i, 'Collaborated with teammates')
    .replace(/^Set technical direction\b/i, 'Improved technical approach for')
    .replace(/^Managed (?:a |the )?team\b/i, 'Worked with teammates on');
  return next.replace(/^\s*[a-z]/, (c) => c.toUpperCase());
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

/** Job title cleaning (synced with src/utils/jobTitle.ts). */
const NOISE_TOKEN =
  /^(remote|hybrid|onsite|on-site|full[- ]?time|part[- ]?time|contract|temporary|internship|urgent|hiring|immediately|new|open|posted|ago|hours?|days?|weeks?|good match|seniority|senior level|mid level|junior level|entry level|united states|usa|u\.s\.?|canada|uk|india|worldwide|atlanta|location|employment type|location type|department|compensation|offers equity|offers bonus|engineering|overview|application|description)$/i;

const TITLE_ROLE_WORD =
  /\b(engineer|developer|manager|analyst|architect|designer|scientist|consultant|specialist|director|lead|administrator|technician|officer|programmer|sre)\b/i;

const ROLE_WORD =
  /\b(Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE)\b/i;

/** Platform/domain specialties that fold into "Senior Android Engineer" style titles. */
const PLATFORM_SPECIALTY =
  /^(Android|iOS|Backend|Back[- ]?End|Front[- ]?End|Frontend|Full[- ]?Stack|Fullstack|Mobile|Web|Platform|Infrastructure|Security|DevOps|Cloud|Data|Embedded|Firmware|QA|Growth|Payments|Search|Networking|Graphics|React|Vue|Angular|Next\.?js|Node\.?js)$/i;

/** Language specialties that fold into "Senior Java Developer" style titles. */
const LANGUAGE_SPECIALTY =
  /^(Kotlin|Java|Swift|Go|Rust|Python|TypeScript|JavaScript|Javascript|C\+\+|C#|Ruby|PHP|Scala)$/i;

const SENIORITY_PREFIX =
  /^(Senior|Sr\.?|Staff|Principal|Lead|Junior|Jr\.?|Associate|Mid-Level|Mid Level|Entry[- ]Level)\s+/i;

const TECH_AFTER_DASH =
  /^(Android|iOS|React|Vue|Angular|Next\.?js|Node\.?js|Backend|Frontend|Full[- ]?Stack|Mobile|Web|Kotlin|Java|Swift|Python|TypeScript|JavaScript|Javascript)$/i;

/**
 * Extract a concise professional job title from raw AI / JD text.
 */
function cleanJobTitle(raw: unknown, companyName?: string): string {
  if (typeof raw !== 'string') return '';

  let title = raw.trim();
  if (!title) return '';

  title = title
    .replace(/[\u00b7\u2022]/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  // Strip JD prose wrappers ("As a …, you will")
  title = title
    .replace(
      /^(?:as an?|we are (?:looking for|hiring)|looking for|join us as|seeking|hiring)\s+/i,
      ''
    )
    .replace(/,?\s*you will\b.*$/i, '')
    .replace(/,?\s*you(?:'ll| will) be\b.*$/i, '')
    .replace(/:\s*$/, '')
    .trim();

  title = title
    .replace(/^company[- ]?logo\s*/i, '')
    .replace(/^job\s*title\s*[:\-–—]\s*/i, '')
    .replace(/^position\s*[:\-–—]\s*/i, '')
    .trim();

  // Browser / ATS page-title junk: "Cloud Platform Engineer Job Details | Farmers Insurance Careers"
  title = title
    .replace(/\bjob\s*details\b.*$/i, '')
    .replace(/\bcareers?\b.*$/i, '')
    .replace(/\b(?:job|role|position)\s+posting\b.*$/i, '')
    .replace(/\s*[|].*$/, '') // anything after a pipe is usually company/site chrome
    .replace(/\s+/g, ' ')
    .trim();

  // Drop unfinished parenthetical fragments: "(React.js"
  title = title.replace(/\([^)]*$/g, '').trim();
  // Drop complete tech stacks in parentheses: "(React.js / Next.js)"
  title = title.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

  // Cut trailing prose: "The Cloud Platform Engineer will design..."
  title = title
    .replace(/\s+will\b.*$/i, '')
    .replace(/\s+is responsible\b.*$/i, '')
    .replace(/\s+responsible for\b.*$/i, '')
    .trim();
  // If line starts with "The <Title>", drop leading The
  title = title.replace(/^the\s+/i, '').trim();

  // Prefer the segment that looks most like a job title when pipe/newline delimited
  const segments = title
    .split(/\s*[|/\n]+|\s{2,}\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length > 1) {
    const scored = segments
      .map((segment) => ({ segment, score: scoreTitleSegment(segment, companyName) }))
      .sort((a, b) => b.score - a.score);
    if (scored[0].score > 0) {
      title = scored[0].segment;
    }
  }

  if (companyName && companyName.trim()) {
    const company = escapeRegExp(companyName.trim());
    title = title
      .replace(new RegExp(`^${company}\\s*[-–—|/:]?\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[-–—|/]?\\s*${company}\\s*$`, 'i'), '')
      .trim();
  }

  // "Senior Javascript Developer - React" → keep core title (React is a focus, not employer)
  {
    const dashSpecialty = title.match(/\s+[-–—]\s+(.+)$/);
    if (dashSpecialty && TECH_AFTER_DASH.test(dashSpecialty[1].trim().split(/[|/]/)[0].trim())) {
      // Prefer the posted role name without trailing tech focus for clarity
      title = title.replace(/\s+[-–—]\s+.+$/, '').trim();
    } else {
      title = title
        .replace(/\s+[-–—]\s+[A-Z][\w.&'"\s-]{1,60}$/g, '')
        .replace(/\s+(?:at|@)\s+[A-Z][\w.&'"\s-]{1,60}$/gi, '')
        .trim();
    }
  }

  title = stripTrailingNoiseClauses(title);

  // "Senior Software Engineer, Android" → "Senior Android Engineer"
  title = normalizeSpecialtyTitle(title);

  title = title.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();
  title = title.replace(/\s+/g, ' ').trim();

  // Canonical casing for common tokens
  title = title
    .replace(/\bJavascript\b/gi, 'JavaScript')
    .replace(/\bTypescript\b/gi, 'TypeScript')
    .replace(/\bNextjs\b/gi, 'Next.js')
    .replace(/\bNodejs\b/gi, 'Node.js');

  if (title.length > 3 && title === title.toUpperCase()) {
    title = title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  } else if (title.length > 3 && title === title.toLowerCase()) {
    // "cloud platform engineer" → "Cloud Platform Engineer"
    title = title.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Final sanity: must look like a real title
  if (!TITLE_ROLE_WORD.test(title) && !/\b(senior|junior|staff|principal|lead)\b/i.test(title)) {
    return '';
  }
  if (/\bas an?\b/i.test(title) || /\byou will\b/i.test(title) || /\($/.test(title)) {
    return '';
  }

  return title;
}

/**
 * Prefer a clean title from the JD header when available; always run through cleanJobTitle.
 */
function resolveJobTitle(
  rawAiTitle: unknown,
  companyName?: string,
  jobDescription?: string
): string {
  const fromAi = cleanJobTitle(rawAiTitle, companyName);
  const fromJd = jobDescription
    ? extractJobTitleFromDescription(jobDescription, companyName || guessCompanyFromTitle(rawAiTitle))
    : '';

  if (!fromJd) return fromAi;
  if (!fromAi) return fromJd;

  // Prefer JD when AI result looks like scraped prose / incomplete
  if (looksLikeBrokenTitle(String(rawAiTitle || '')) || looksLikeBrokenTitle(fromAi)) {
    return fromJd;
  }

  // Prefer the clearer header-style title from the JD
  const jdScore = scoreTitleSegment(fromJd, companyName) + 2; // slight JD bias
  const aiScore = scoreTitleSegment(fromAi, companyName);
  if (isSpecificTitle(fromJd) && !isSpecificTitle(fromAi)) return fromJd;
  if (isSpecificTitle(fromAi) && !isSpecificTitle(fromJd) && aiScore > jdScore + 2) return fromAi;
  return jdScore >= aiScore ? fromJd : fromAi;
}

/** Scan early JD lines for the official posted role title. */
function extractJobTitleFromDescription(
  jobDescription: string,
  companyName?: string
): string {
  if (!jobDescription?.trim()) return '';

  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);

  let best = '';
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 3 || line.length > 100) continue;
    if (
      /^(location|employment|department|compensation|about|overview|application|description|requirements|primary requirements|preferred|benefits|powered by|equal opportunity|apply|privacy|help|accessibility|view website|view all jobs|india|remote\s*engineering|company[- ]?logo|position|time|remote|seniority|money|date|fair match|experience level|skill|industry exp\.?|insider connection|responsibilities|qualification|required|note|find any email|beyond your network|from your previous company|from your school|get \d|property & casualty|health insurance|auto insurance|life insurance)$/i.test(
        line
      )
    ) {
      continue;
    }
    // Skip match-% / UI chrome lines
    if (/^\d+%\s*$/.test(line) || /^\$\d/.test(line) || /^\d+\+?\s*years?\s*exp/i.test(line)) {
      continue;
    }
    // Never use body prose as the title
    if (/^as an?\b/i.test(line) || /\byou will\b/i.test(line) || /\bwill design\b/i.test(line)) {
      continue;
    }
    if (/\bjob\s*details\b/i.test(line) && TITLE_ROLE_WORD.test(line)) {
      // Still usable after cleaning — don't skip entirely
    } else if (/\bjob\s*details\b/i.test(line)) {
      continue;
    }
    if (companyName && line.toLowerCase() === companyName.trim().toLowerCase()) continue;
    if (!TITLE_ROLE_WORD.test(line) && !/\b(senior|junior|staff|principal|lead|associate)\b/i.test(line)) {
      continue;
    }

    const cleaned = cleanJobTitle(line, companyName);
    if (!cleaned || looksLikeBrokenTitle(cleaned)) continue;

    let score = scoreTitleSegment(cleaned, companyName);
    // Prefer early header lines (posted title usually near top after company name)
    if (i <= 4) score += 4;
    else if (i <= 10) score += 1;
    // Prefer concise title lines
    if (cleaned.split(/\s+/).length <= 5) score += 2;
    if (isSpecificTitle(cleaned)) score += 1;
    // Prefer lines that look like "Senior X Developer - React" headers
    if (/\b(developer|engineer)\b/i.test(line) && line.length < 60) score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }

  return bestScore > 0 ? best : '';
}

function looksLikeBrokenTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/^as an?\b/i.test(t)) return true;
  if (/\byou will\b/i.test(t)) return true;
  if (/\bjob\s*details\b/i.test(t)) return true;
  if (/\bcareers?\b/i.test(t)) return true;
  if (/\([^)]*$/.test(t)) return true; // unclosed paren
  if (/\($/.test(t)) return true;
  if (/\/\s*$/.test(t)) return true;
  if (t.length > 70) return true;
  return false;
}

/**
 * Fold comma specialties into a normal professional title.
 * "Senior Software Engineer, Android" → "Senior Android Engineer"
 * Unknown specialties are dropped → keep core title only.
 */
function normalizeSpecialtyTitle(title: string): string {
  if (!title) return title;

  let core = title;
  let specialty = '';

  if (title.includes(',')) {
    const parts = title.split(',').map((p) => p.trim()).filter(Boolean);
    core = parts[0] || title;
    specialty = parts.slice(1).join(' ').trim();
  } else {
    const trail = title.match(
      new RegExp(
        `^(.+?\\b(?:Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE))\\s+(.+)$`,
        'i'
      )
    );
    if (trail) {
      const tail = trail[2].trim();
      if (PLATFORM_SPECIALTY.test(tail) || LANGUAGE_SPECIALTY.test(tail)) {
        core = trail[1].trim();
        specialty = tail;
      }
    }
  }

  if (!specialty || NOISE_TOKEN.test(specialty)) {
    return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  }

  const specialtyHead = specialty.split(/[|/]/)[0].trim();
  if (!specialtyHead || NOISE_TOKEN.test(specialtyHead)) {
    return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  }

  const seniorityMatch = core.match(SENIORITY_PREFIX);
  const seniority = seniorityMatch ? seniorityMatch[1].replace(/\.$/, '') : '';
  const seniorityLabel = /^sr\.?$/i.test(seniority)
    ? 'Senior'
    : /^jr\.?$/i.test(seniority)
      ? 'Junior'
      : seniority;

  const roleMatch = core.match(ROLE_WORD);
  const role = roleMatch ? roleMatch[0] : 'Engineer';

  // For language already in the core title ("Senior JavaScript Developer"), drop trailing specialty
  if (LANGUAGE_SPECIALTY.test(specialtyHead) && /\b(JavaScript|Javascript|TypeScript|Python|Java|Kotlin)\b/i.test(core)) {
    return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  }

  if (PLATFORM_SPECIALTY.test(specialtyHead)) {
    const label = canonicalSpecialty(specialtyHead);
    // Don't turn "Senior JavaScript Developer" into "Senior React Developer" via comma path only;
    // for "Software Engineer, Android" folding is desired.
    if (/\b(JavaScript|Javascript|TypeScript)\s+Developer\b/i.test(core) && /^(React|Vue|Angular|Next)/i.test(label)) {
      return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
    }
    return [seniorityLabel, label, role].filter(Boolean).join(' ');
  }

  if (LANGUAGE_SPECIALTY.test(specialtyHead)) {
    const label = canonicalSpecialty(specialtyHead);
    const langRole = /\bDeveloper\b/i.test(core) ? 'Developer' : role;
    return [seniorityLabel, label, langRole].filter(Boolean).join(' ');
  }

  return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

function canonicalSpecialty(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, '');
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
    react: 'React',
    vue: 'Vue',
    angular: 'Angular',
    nextjs: 'Next.js',
    'next.js': 'Next.js',
    nodejs: 'Node.js',
    'node.js': 'Node.js',
    kotlin: 'Kotlin',
    java: 'Java',
    swift: 'Swift',
    go: 'Go',
    rust: 'Rust',
    python: 'Python',
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    'c++': 'C++',
    'c#': 'C#',
  };
  return map[lower] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isSpecificTitle(title: string): boolean {
  return (
    /\b(Android|iOS|Backend|Frontend|Full Stack|Mobile|Web|Platform|Kotlin|Java|Swift|Python|TypeScript|JavaScript|React|Vue|Angular)\b/i.test(
      title
    ) && !/,/.test(title)
  );
}

function stripTrailingNoiseClauses(title: string): string {
  title = title
    .replace(/\s+Location\b.*$/i, '')
    .replace(/\s+Employment Type\b.*$/i, '')
    .replace(/\s+Location Type\b.*$/i, '')
    .replace(/\s+Department\b.*$/i, '')
    .replace(/\s+Compensation\b.*$/i, '')
    .replace(/\s+RemoteEngineering\b.*$/i, '')
    .trim();

  if (title.includes(',')) {
    const parts = title.split(',').map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part, index) => {
      if (index === 0) return true;
      if (NOISE_TOKEN.test(part)) return false;
      if (/^(remote|hybrid|onsite)/i.test(part)) return false;
      if (/\b(atlanta|san francisco|washington|new york|seattle|austin|boston|india)\b/i.test(part)) {
        return false;
      }
      return part.length <= 40;
    });
    title = kept.join(', ');
  }

  return title.trim();
}

function scoreTitleSegment(segment: string, companyName?: string): number {
  let score = 0;
  const lower = segment.toLowerCase();

  if (TITLE_ROLE_WORD.test(segment)) score += 5;
  if (/\b(senior|junior|staff|principal|lead|associate|mid-level|sr\.?|jr\.?)\b/i.test(segment)) {
    score += 2;
  }
  if (NOISE_TOKEN.test(segment)) score -= 4;
  if (/\bjob\s*details\b/i.test(segment)) score -= 8;
  if (/\bcareers?\b/i.test(segment)) score -= 6;
  if (companyName && new RegExp(escapeRegExp(companyName), 'i').test(segment)) score -= 3;
  if (/^https?:\/\//i.test(segment)) score -= 10;
  if (segment.length > 80) score -= 2;
  if (segment.length < 3) score -= 5;
  if (/^\d+%/.test(segment) || /match/i.test(lower)) score -= 5;
  if (/\b(location|compensation|department|overview|about the position|description)\b/i.test(segment)) {
    score -= 5;
  }
  if (/^as an?\b/i.test(segment) || /\byou will\b/i.test(segment)) score -= 10;
  if (/\([^)]*$/.test(segment) || /\($/.test(segment)) score -= 8;
  if (/,/.test(segment)) score -= 1;

  return score;
}

function guessCompanyFromTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const first = raw.trim().split(/\s+/)[0];
  if (first && first.length <= 24 && !TITLE_ROLE_WORD.test(first) && !/^(senior|junior|staff|as)$/i.test(first)) {
    return first;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  const recent = mostRecentExperienceIndices(experience, 2);
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

  const recentSet = options.stressIndustryLast2
    ? new Set(mostRecentExperienceIndices(roles, 2))
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
    ? new Set(mostRecentExperienceIndices(experience, 2))
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
   - jobTitle must be a clean professional title only (e.g. "Senior JavaScript Developer", "Senior Android Engineer", "Senior Software Engineer")
   - Use the posted title near the top of the JD (e.g. "Senior Javascript Developer - React" → "Senior JavaScript Developer"; "Cloud Platform Engineer Job Details | Farmers Insurance Careers" → "Cloud Platform Engineer")
   - NEVER extract from body prose like "As a Senior Frontend Developer (React.js / Next.js), you will"
   - Never return incomplete titles or ATS/page chrome (bad: "Cloud Platform Engineer Job Details", "As a Senior Frontend Developer (React.js")
   - Convert posted specialties into normal titles when needed: "Senior Software Engineer, Android" → "Senior Android Engineer"
   - Never return comma specialties like "Senior Software Engineer, Android" or glued forms like "Senior Software Engineer Android"
   - Strip company name, location, remote/hybrid, full-time/part-time, seniority badges, match %, and other marketing/UI noise
   - Do NOT return titles like "Senior Java Developer - Chordline Health" or "Senior Java Developer | Remote"
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

