const NON_REMOTE_SOURCE = String.raw`\b(hybrid|on[\s-]*site)\b`;
const SNIPPET_RADIUS = 56;

export const NON_REMOTE_ROLE_MESSAGE =
  'This is not a remote role. Resume generation is only allowed for remote positions.';

export type NonRemoteMatch = {
  workType: string;
  matchedText: string;
  snippet: string;
};

export function findNonRemoteMatches(text: string): NonRemoteMatch[] {
  if (!text) return [];

  const matches: NonRemoteMatch[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(NON_REMOTE_SOURCE, 'gi');
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const start = Math.max(0, match.index - SNIPPET_RADIUS);
    const end = Math.min(text.length, match.index + match[0].length + SNIPPET_RADIUS);
    const prefix = start > 0 ? '…' : '';
    const suffix = end < text.length ? '…' : '';
    const snippet = `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push({
      workType: match[1].replace(/\s+/g, ' ').toLowerCase(),
      matchedText: match[0],
      snippet,
    });
  }

  return matches;
}

export function findNonRemoteWorkType(text: string): string | null {
  return findNonRemoteMatches(text)[0]?.workType ?? null;
}

export function isNonRemoteRole(text: string): boolean {
  return findNonRemoteMatches(text).length > 0;
}

export function nonRemoteRoleMessage(text?: string): string {
  const workType = text ? findNonRemoteWorkType(text) : null;
  if (!workType) return NON_REMOTE_ROLE_MESSAGE;
  return `This is not a remote role (${workType}). Resume generation is only allowed for remote positions.`;
}

export class NonRemoteRoleError extends Error {
  constructor(message = NON_REMOTE_ROLE_MESSAGE) {
    super(message);
    this.name = 'NonRemoteRoleError';
  }
}

export function assertRemoteJobDescription(jobDescription: string, ignore = false): void {
  if (ignore) return;
  if (isNonRemoteRole(jobDescription)) {
    throw new NonRemoteRoleError(nonRemoteRoleMessage(jobDescription));
  }
}
