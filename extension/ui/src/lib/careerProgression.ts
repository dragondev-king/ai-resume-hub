/**
 * Minimal date helpers for company-tailor mode (two most recent roles).
 */

type DatedExperience = {
  start_date?: string;
  end_date?: string;
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

function parseStartSortDate(start?: string, end?: string): string {
  const startKey = parseEndSortDate(start);
  if (startKey) return startKey;
  const endKey = parseEndSortDate(end);
  if (endKey === '9999-12') return '9999-11';
  if (endKey) return endKey;
  return '';
}

export function mostRecentIndices(experience: DatedExperience[], count = 2): number[] {
  const total = experience.length;
  const keys = experience.map((exp, index) => {
    let start = parseStartSortDate(exp.start_date, exp.end_date);
    let end = parseEndSortDate(exp.end_date);
    if (!start && !end) {
      const rank = total - index;
      const synthetic = `8888-${String(rank).padStart(2, '0')}`;
      start = synthetic;
      end = synthetic;
    }
    return { start, end, index };
  });

  const chrono = experience
    .map((_, index) => index)
    .sort((a, b) => {
      const keyA = keys[a];
      const keyB = keys[b];
      if (keyA.start !== keyB.start) return keyA.start.localeCompare(keyB.start);
      if (keyA.end !== keyB.end) return keyA.end.localeCompare(keyB.end);
      return keyB.index - keyA.index;
    });

  return chrono.slice(-count).reverse();
}
