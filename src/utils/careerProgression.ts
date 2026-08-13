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

function parseSortDate(value?: string): string {
  if (!value) return '';
  // Prefer YYYY-MM or YYYY-MM-DD; "Present"/empty sorts as far future for end dates
  const trimmed = value.trim();
  if (!trimmed || /^present$/i.test(trimmed) || /^current$/i.test(trimmed)) {
    return '9999-12';
  }
  return trimmed.slice(0, 7);
}

/** Indices sorted oldest → newest by start_date (then end_date). */
export function chronologicalIndices(experience: DatedExperience[]): number[] {
  return experience
    .map((_, index) => index)
    .sort((a, b) => {
      const startA = parseSortDate(experience[a]?.start_date);
      const startB = parseSortDate(experience[b]?.start_date);
      if (startA !== startB) return startA.localeCompare(startB);
      const endA = parseSortDate(experience[a]?.end_date);
      const endB = parseSortDate(experience[b]?.end_date);
      return endA.localeCompare(endB);
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
