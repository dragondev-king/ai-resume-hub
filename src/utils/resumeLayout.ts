/** Shared resume visual design tokens and skill helpers (DOCX + PDF). */

export const RESUME_COLORS = {
  primary: '124E44', // teal — name & section headers
  accent: '3CB370', // green — title & contact labels
  body: '3D3D3D',
  muted: '666666',
} as const;

export const RESUME_FONTS = {
  /** Full name + section headers */
  heading: 'Verdana',
  /** Body content (summary, skills, experience, contact, etc.) */
  body: 'Lucida Sans',
} as const;

/** Half-points for DOCX TextRun size (e.g. 48 = 24pt). */
export const RESUME_SIZES = {
  name: 48,
  title: 26,
  section: 24,
  /** Company name + job title in experience */
  experienceHeading: 22,
  /** Date ranges / periods */
  experienceMeta: 18,
  /** All other body content — 8pt */
  body: 16,
  bodySmall: 16,
  contact: 16,
  experienceBullet: 16,
} as const;

/** Point sizes for PDF (jsPDF) — kept in sync with RESUME_SIZES (half-points / 2). */
export const RESUME_PDF_SIZES = {
  name: 24,
  title: 13,
  section: 12,
  experienceHeading: 11,
  experienceMeta: 9,
  body: 8,
} as const;

/** Page margins in points (1 inch = 72pt). Shared by PDF; DOCX uses twips (×20). */
export const RESUME_PAGE_MARGIN_PT = 36; // 0.5"

/** Spacing tokens shared by DOCX + PDF generators. */
export const RESUME_SPACING = {
  /** DOCX character spacing in twentieths of a point (20 ≈ 1pt). */
  charSpacing: 12,
  /** DOCX paragraph line spacing (240 = single spacing). */
  line: 276, // ~1.15×
  /** PDF extra space between characters (pt). */
  pdfCharSpace: 0.25,
  /** PDF line-height multiplier. */
  pdfLineHeight: 1.25,
} as const;

export type CategorizedSkills = { label: string; skills: string[] }[];

const SOFT_SKILL_PATTERN =
  /\b(communication|leadership|teamwork|collaboration|collaborative|problem[- ]?solving|critical thinking|time management|adaptability|adaptable|mentoring|mentorship|coaching|presentation|public speaking|conflict resolution|emotional intelligence|creativity|creative|attention to detail|organization|organizational|self[- ]?motivated|self[- ]?starter|work ethic|interpersonal|stakeholder|client[- ]?facing|customer service|negotiation|empathy|initiative|ownership|accountability|reliability|flexible|flexibility|multitasking|prioritization|decision[- ]?making|analytical thinking)\b/i;

function normalizeSkillKey(skill: string): string {
  return skill.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isSoftSkill(skill: string): boolean {
  return SOFT_SKILL_PATTERN.test(skill.trim());
}

export function isSoftSkillLabel(skill: string): boolean {
  return isSoftSkill(sanitizeSkillName(skill));
}

function uniqueSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const skill of skills) {
    const trimmed = sanitizeSkillName(skill);
    if (!trimmed) continue;
    const key = normalizeSkillKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Split generated skills into Hard Skills and Soft Skills.
 * Always returns both sections. Prefer AI-provided groups when present.
 */
export function buildResumeSkillSections(
  jobSkills: string[] = [],
  grouped?: { hard?: string[]; soft?: string[] }
): CategorizedSkills {
  const groupedHard = uniqueSkills(grouped?.hard ?? []);
  const groupedSoft = uniqueSkills(grouped?.soft ?? []);
  const current = uniqueSkills(jobSkills);
  const groupedKeys = new Set([...groupedHard, ...groupedSoft].map(normalizeSkillKey));
  const currentKeys = new Set(current.map(normalizeSkillKey));
  const groupsMatchCurrent =
    groupedKeys.size === currentKeys.size &&
    [...groupedKeys].every((key) => currentKeys.has(key));

  let hard: string[] = [];
  let soft: string[] = [];

  if (groupedHard.length + groupedSoft.length > 0 && groupsMatchCurrent) {
    hard = groupedHard;
    soft = groupedSoft;
  } else {
    for (const skill of current) {
      if (isSoftSkill(skill)) soft.push(skill);
      else hard.push(skill);
    }
  }

  return [
    { label: 'Hard Skills', skills: hard },
    { label: 'Soft Skills', skills: soft },
  ];
}

/** Flat list of all skills shown on the resume. */
export function flattenSkillSections(sections: CategorizedSkills): string[] {
  return sections.flatMap((s) => s.skills);
}

/** @deprecated Prefer buildResumeSkillSections — kept for any callers expecting the old name. */
export function categorizeSkills(skills: string[]): CategorizedSkills {
  return buildResumeSkillSections(skills);
}

export type BoldTextSegment = { text: string; bold: boolean };

/**
 * Parse AI markup that wraps tech skills: <b>React</b>, <bold>React</bold>, or **React**.
 * Used when rendering summary / experience bullets in DOCX/PDF/UI.
 */
export function parseBoldMarkup(input: string): BoldTextSegment[] {
  if (!input) return [];
  const segments: BoldTextSegment[] = [];
  const re = /<(?:b|bold)>([\s\S]*?)<\/(?:b|bold)>|\*\*([\s\S]*?)\*\*/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), bold: false });
    }
    const boldText = match[1] ?? match[2] ?? '';
    if (boldText) {
      segments.push({ text: boldText, bold: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), bold: false });
  }

  return segments.filter((s) => s.text.length > 0);
}

/** Plain text with bold markers removed (for length checks / fallbacks). */
export function stripBoldMarkup(input: string): string {
  return parseBoldMarkup(input)
    .map((s) => s.text)
    .join('');
}

/** Skills are plain labels — never keep <b>, <br>, or other markup. */
export function sanitizeSkillName(skill: string): string {
  return stripBoldMarkup(String(skill ?? ''))
    .replace(/<\/?br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Ensure a trailing period without disturbing markup near the end. */
export function ensureTrailingPeriod(input: string): string {
  const plain = stripBoldMarkup(input).trimEnd();
  if (!plain || plain.endsWith('.')) return input;
  return `${input.trimEnd()}.`;
}
