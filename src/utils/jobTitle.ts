/**
 * Normalize extracted job titles into a clean professional title.
 * Strips company/location/employment noise and comma specialties.
 * Examples:
 *  "Senior Software Engineer, Android" → "Senior Android Engineer"
 *  "Senior Software Engineer Android" → "Senior Android Engineer"
 *  "Senior Java Developer | Remote" → "Senior Java Developer"
 */

const NOISE_TOKEN =
  /^(remote|hybrid|onsite|on-site|full[- ]?time|part[- ]?time|contract|temporary|internship|urgent|hiring|immediately|new|open|posted|ago|hours?|days?|weeks?|good match|seniority|senior level|mid level|junior level|entry level|united states|usa|u\.s\.?|canada|uk|worldwide|atlanta|location|employment type|location type|department|compensation|offers equity|offers bonus)$/i;

const TITLE_ROLE_WORD =
  /\b(engineer|developer|manager|analyst|architect|designer|scientist|consultant|specialist|director|lead|administrator|technician|officer|programmer|sre)\b/i;

const ROLE_WORD =
  /\b(Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE)\b/i;

/** Platform/domain specialties that fold into "Senior Android Engineer" style titles. */
const PLATFORM_SPECIALTY =
  /^(Android|iOS|Backend|Back[- ]?End|Front[- ]?End|Frontend|Full[- ]?Stack|Fullstack|Mobile|Web|Platform|Infrastructure|Security|DevOps|Cloud|Data|Embedded|Firmware|QA|Growth|Payments|Search|Networking|Graphics)$/i;

/** Language specialties that fold into "Senior Java Developer" style titles. */
const LANGUAGE_SPECIALTY =
  /^(Kotlin|Java|Swift|Go|Rust|Python|TypeScript|JavaScript|C\+\+|C#|Node\.?js|Ruby|PHP|Scala)$/i;

const SENIORITY_PREFIX =
  /^(Senior|Sr\.?|Staff|Principal|Lead|Junior|Jr\.?|Associate|Mid-Level|Mid Level|Entry[- ]Level)\s+/i;

/**
 * Extract a concise professional job title from raw AI / JD text.
 */
export function cleanJobTitle(raw: unknown, companyName?: string): string {
  if (typeof raw !== 'string') return '';

  let title = raw.trim();
  if (!title) return '';

  title = title
    .replace(/[\u00b7\u2022]/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  title = title
    .replace(/^company[- ]?logo\s*/i, '')
    .replace(/^job\s*title\s*[:\-–—]\s*/i, '')
    .replace(/^position\s*[:\-–—]\s*/i, '')
    .trim();

  // Prefer the segment that looks most like a job title when pipe/newline delimited
  const segments = title
    .split(/\s*[|/\n]+\s*/)
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

  title = title
    .replace(/\s+[-–—]\s+[A-Z][\w.&'"\s-]{1,60}$/g, '')
    .replace(/\s+(?:at|@)\s+[A-Z][\w.&'"\s-]{1,60}$/gi, '')
    .trim();

  title = stripTrailingNoiseClauses(title);

  // "Senior Software Engineer, Android" / "... Android" → "Senior Android Engineer"
  title = normalizeSpecialtyTitle(title);

  title = title.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();
  title = title.replace(/\s+/g, ' ').trim();

  if (title.length > 3 && title === title.toUpperCase()) {
    title = title.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return title;
}

/**
 * Prefer a clean title from the JD when available; always run through cleanJobTitle.
 */
export function resolveJobTitle(
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

  // Prefer the more specific clean title (e.g. Senior Android Engineer over Senior Software Engineer)
  const jdSpecific = isSpecificTitle(fromJd);
  const aiSpecific = isSpecificTitle(fromAi);
  if (jdSpecific && !aiSpecific) return fromJd;
  if (aiSpecific && !jdSpecific) return fromAi;

  const jdScore = scoreTitleSegment(fromJd, companyName);
  const aiScore = scoreTitleSegment(fromAi, companyName);
  return jdScore >= aiScore ? fromJd : fromAi;
}

/** Scan early JD lines for the official role title, then normalize professionally. */
export function extractJobTitleFromDescription(
  jobDescription: string,
  companyName?: string
): string {
  if (!jobDescription?.trim()) return '';

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
    if (!TITLE_ROLE_WORD.test(line) && !/\b(senior|junior|staff|principal|lead|associate)\b/i.test(line)) {
      continue;
    }

    const cleaned = cleanJobTitle(line, companyName);
    if (!cleaned) continue;

    let score = scoreTitleSegment(cleaned, companyName);
    if (isSpecificTitle(cleaned)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = cleaned;
    }
  }

  return bestScore > 0 ? best : '';
}

/**
 * Fold comma / trailing specialties into a normal professional title.
 * "Senior Software Engineer, Android" → "Senior Android Engineer"
 * "Software Engineer, Backend" → "Backend Engineer"
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
      new RegExp(`^(.+?\\b(?:Engineer|Developer|Manager|Analyst|Architect|Designer|Scientist|Consultant|Specialist|Director|Lead|Administrator|Technician|Officer|Programmer|SRE))\\s+(.+)$`, 'i')
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

  // Take first specialty token if multiple leaked in
  const specialtyHead = specialty.split(/[|/]/)[0].trim();
  if (!specialtyHead || NOISE_TOKEN.test(specialtyHead)) {
    return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
  }

  const seniorityMatch = core.match(SENIORITY_PREFIX);
  const seniority = seniorityMatch ? seniorityMatch[1].replace(/\.$/, '') : '';
  // Normalize Sr/Jr
  const seniorityLabel = /^sr\.?$/i.test(seniority)
    ? 'Senior'
    : /^jr\.?$/i.test(seniority)
      ? 'Junior'
      : seniority;

  const roleMatch = core.match(ROLE_WORD);
  const role = roleMatch ? roleMatch[0] : 'Engineer';

  if (PLATFORM_SPECIALTY.test(specialtyHead)) {
    const label = canonicalSpecialty(specialtyHead);
    return [seniorityLabel, label, role].filter(Boolean).join(' ');
  }

  if (LANGUAGE_SPECIALTY.test(specialtyHead)) {
    const label = canonicalSpecialty(specialtyHead);
    const langRole = /\bDeveloper\b/i.test(core) ? 'Developer' : role;
    return [seniorityLabel, label, langRole].filter(Boolean).join(' ');
  }

  // Unknown specialty: drop it, keep clean core without commas
  return core.replace(/,/g, '').replace(/\s+/g, ' ').trim();
}

function canonicalSpecialty(raw: string): string {
  const lower = raw.toLowerCase().replace(/\s+/g, '');
  const map: Record<string, string> = {
    android: 'Android',
    ios: 'iOS',
    backend: 'Backend',
    'back-end': 'Backend',
    'back–end': 'Backend',
    frontend: 'Frontend',
    'front-end': 'Frontend',
    'front–end': 'Frontend',
    fullstack: 'Full Stack',
    'full-stack': 'Full Stack',
    'full–stack': 'Full Stack',
    mobile: 'Mobile',
    web: 'Web',
    platform: 'Platform',
    infrastructure: 'Infrastructure',
    security: 'Security',
    devops: 'DevOps',
    cloud: 'Cloud',
    data: 'Data',
    embedded: 'Embedded',
    firmware: 'Firmware',
    qa: 'QA',
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
    nodejs: 'Node.js',
    'node.js': 'Node.js',
  };
  return map[lower] || raw.charAt(0).toUpperCase() + raw.slice(1);
}

function isSpecificTitle(title: string): boolean {
  return (
    /\b(Android|iOS|Backend|Frontend|Full Stack|Mobile|Web|Platform|Kotlin|Java|Swift|Python|TypeScript)\b/i.test(
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
    .trim();

  if (title.includes(',')) {
    const parts = title.split(',').map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part, index) => {
      if (index === 0) return true;
      if (NOISE_TOKEN.test(part)) return false;
      if (/^(remote|hybrid|onsite)/i.test(part)) return false;
      if (/\b(atlanta|san francisco|washington|new york|seattle|austin|boston)\b/i.test(part)) {
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
  if (companyName && new RegExp(escapeRegExp(companyName), 'i').test(segment)) score -= 3;
  if (/^https?:\/\//i.test(segment)) score -= 10;
  if (segment.length > 80) score -= 2;
  if (segment.length < 3) score -= 5;
  if (/^\d+%/.test(segment) || /match/i.test(lower)) score -= 5;
  if (/\b(location|compensation|department|overview|about the position)\b/i.test(segment)) {
    score -= 5;
  }
  // Prefer titles without leftover commas
  if (/,/.test(segment)) score -= 1;

  return score;
}

function guessCompanyFromTitle(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const first = raw.trim().split(/\s+/)[0];
  if (first && first.length <= 24 && !TITLE_ROLE_WORD.test(first) && !/^(senior|junior|staff)/i.test(first)) {
    return first;
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
