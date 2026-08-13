/**
 * Normalize extracted job titles into a clean professional title.
 * Strips company names, locations, employment type, and other JD noise.
 */

const NOISE_SEGMENT =
  /\b(remote|hybrid|onsite|on-site|full[- ]?time|part[- ]?time|contract|temporary|internship|urgent|hiring|immediately|new|open|posted|ago|hours?|days?|weeks?|good match|seniority|senior level|mid level|junior level|entry level|united states|usa|u\.s\.?|canada|uk|worldwide)\b/i;

/**
 * Extract a concise professional job title from raw AI / JD text.
 * Examples:
 *  "Senior Java Developer - Chordline Health" → "Senior Java Developer"
 *  "Senior Java Developer | Remote | Full-time" → "Senior Java Developer"
 *  "company-logo Chordline Health · Senior Java Developer - Chordline Health" → "Senior Java Developer"
 */
export function cleanJobTitle(raw: unknown, companyName?: string): string {
  if (typeof raw !== 'string') return '';

  let title = raw.trim();
  if (!title) return '';

  // Normalize separators and whitespace
  title = title
    .replace(/[\u00b7\u2022]/g, ' | ') // · •
    .replace(/\s+/g, ' ')
    .trim();

  // Drop obvious UI/prefix junk
  title = title
    .replace(/^company[- ]?logo\s*/i, '')
    .replace(/^job\s*title\s*[:\-–—]\s*/i, '')
    .replace(/^position\s*[:\-–—]\s*/i, '')
    .trim();

  // Prefer the segment that looks most like a job title when pipe/dash delimited
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

  // Remove trailing " - Company" / " at Company" / " @ Company"
  title = title
    .replace(/\s+[-–—]\s+[A-Z][\w.&'"\s-]{1,60}$/g, '')
    .replace(/\s+(?:at|@)\s+[A-Z][\w.&'"\s-]{1,60}$/gi, '')
    .trim();

  if (companyName && companyName.trim()) {
    const company = escapeRegExp(companyName.trim());
    title = title
      .replace(new RegExp(`\\s*[-–—|/]?\\s*${company}\\s*$`, 'i'), '')
      .replace(new RegExp(`^${company}\\s*[-–—|/:]?\\s*`, 'i'), '')
      .trim();
  }

  // Strip leftover noise tokens that sometimes stick to titles
  title = title
    .split(/\s*[|,]\s*/)
    .map((part) => part.trim())
    .filter((part) => part && !NOISE_SEGMENT.test(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Final cleanup of dangling punctuation
  title = title.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();

  // Title-case lightly only if the whole string is shouting
  if (title.length > 3 && title === title.toUpperCase()) {
    title = title
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return title;
}

function scoreTitleSegment(segment: string, companyName?: string): number {
  let score = 0;
  const lower = segment.toLowerCase();

  if (
    /\b(engineer|developer|manager|analyst|architect|designer|scientist|consultant|specialist|director|lead|administrator|technician|officer|programmer)\b/i.test(
      segment
    )
  ) {
    score += 5;
  }
  if (
    /\b(senior|junior|staff|principal|lead|associate|mid-level|sr\.?|jr\.?)\b/i.test(segment)
  ) {
    score += 2;
  }
  if (NOISE_SEGMENT.test(segment)) score -= 4;
  if (companyName && new RegExp(escapeRegExp(companyName), 'i').test(segment)) score -= 3;
  if (/^https?:\/\//i.test(segment)) score -= 10;
  if (segment.length > 60) score -= 2;
  if (segment.length < 3) score -= 5;
  if (/^\d+%/.test(segment) || /match/i.test(lower)) score -= 5;

  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
