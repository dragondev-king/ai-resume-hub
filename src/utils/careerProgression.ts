/**
 * Career title progression helpers for tailor-company mode.
 * Titles grow junior → senior by employment chronology.
 * Company substitution targets only the two most recent roles.
 */

export type DatedExperience = {
  start_date?: string;
  end_date?: string;
  position?: string;
  company?: string;
  [key: string]: unknown;
};

function parseEndSortDate(value?: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed) || /^current$/i.test(trimmed)) {
    return '9999-12';
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return trimmed.slice(0, 7);
}

/** Sort key for start_date; missing values infer recency from end_date when possible. */
function parseStartSortDate(start?: string, end?: string): string {
  const startKey = parseEndSortDate(start);
  if (startKey) return startKey;

  const endKey = parseEndSortDate(end);
  if (endKey === '9999-12') return '9999-11'; // current role without start → treat as newest
  if (endKey) return endKey; // past role without start → approximate from end date
  return '';
}

function chronologicalSortKeys(experience: DatedExperience[]): Array<{ start: string; end: string; index: number }> {
  const total = experience.length;
  return experience.map((exp, index) => {
    let start = parseStartSortDate(exp.start_date, exp.end_date);
    let end = parseEndSortDate(exp.end_date);
    if (!start && !end) {
      // No dates: assume lower index = more recent (typical resume order)
      const rank = total - index;
      const synthetic = `8888-${String(rank).padStart(2, '0')}`;
      start = synthetic;
      end = synthetic;
    }
    return { start, end, index };
  });
}

/** Indices sorted oldest → newest by start_date (then end_date, then array index). */
export function chronologicalIndices(experience: DatedExperience[]): number[] {
  const keys = chronologicalSortKeys(experience);
  return experience
    .map((_, index) => index)
    .sort((a, b) => {
      const keyA = keys[a];
      const keyB = keys[b];
      if (keyA.start !== keyB.start) return keyA.start.localeCompare(keyB.start);
      if (keyA.end !== keyB.end) return keyA.end.localeCompare(keyB.end);
      return keyB.index - keyA.index;
    });
}

/** Indices of the two most recent roles (newest first). */
export function mostRecentIndices(experience: DatedExperience[], count = 2): number[] {
  const chrono = chronologicalIndices(experience);
  return chrono.slice(-count).reverse();
}

/**
 * Build titles oldest→newest: Junior … → Senior (JD title).
 * Returns an array aligned to the experience index order (not chronological order).
 */
export function buildCareerTitleLadder(
  targetTitle: string,
  experience: DatedExperience[]
): string[] {
  const count = experience.length;
  if (count <= 0) return [];

  // Expect callers to pass a cleaned title; still strip leftover company/noise suffixes lightly
  const cleaned =
    (targetTitle || '')
      .trim()
      .replace(/\s+[-–—]\s+[A-Z][\w.&'"\s-]{1,60}$/g, '')
      .replace(/\s+/g, ' ')
      .trim() || 'Software Engineer';
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

  // oldest → newest titles
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

  const chrono = chronologicalIndices(experience);
  const byIndex: string[] = new Array(count);
  chrono.forEach((expIndex, careerStep) => {
    byIndex[expIndex] = oldestToNewest[careerStep];
  });

  // Safety net: the most recent role always gets the senior title
  const newestIndex = chrono[chrono.length - 1];
  if (newestIndex !== undefined) {
    byIndex[newestIndex] = seniorTitle;
  }

  return byIndex;
}

export function applyCareerTitleProgression<T extends DatedExperience>(
  experience: T[],
  targetTitle: string
): T[] {
  if (!experience.length) return experience;
  const ladder = buildCareerTitleLadder(targetTitle, experience);
  return experience.map((exp, index) => ({
    ...exp,
    position: ladder[index] || exp.position || '',
  }));
}

const JUNIOR_TITLE = /\b(Junior|Jr\.?|Entry[- ]Level|Intern)\b/i;
const ASSOCIATE_OR_MID_TITLE =
  /\b(Associate|Mid-Level|Mid Level)\b/i;

const JUNIOR_LEADERSHIP_OPENERS: Array<[RegExp, string]> = [
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

/** Soften leadership claims that don't fit Junior / early-career titles. */
export function toneDescriptionsToSeniority<T extends DatedExperience & { descriptions?: string[] }>(
  experience: T[]
): T[] {
  return experience.map((exp) => {
    const position = String(exp.position || '');
    const descriptions = Array.isArray(exp.descriptions) ? exp.descriptions : [];
    if (!descriptions.length) return exp;

    if (JUNIOR_TITLE.test(position)) {
      return {
        ...exp,
        descriptions: descriptions.map((line) => softenJuniorBullet(String(line || ''))),
      };
    }

    if (ASSOCIATE_OR_MID_TITLE.test(position) || !/\b(Senior|Staff|Principal|Lead)\b/i.test(position)) {
      // Mid titles (and bare "X Engineer"): block only strong org-leadership openers
      return {
        ...exp,
        descriptions: descriptions.map((line) =>
          softenMidBullet(String(line || ''))
        ),
      };
    }

    return exp;
  });
}

function softenJuniorBullet(line: string): string {
  let next = line.trim();
  for (const [pattern, replacement] of JUNIOR_LEADERSHIP_OPENERS) {
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
