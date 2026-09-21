const NON_REMOTE_PATTERN = /\b(hybrid|on[\s-]*site)\b/i;

export const NON_REMOTE_ROLE_MESSAGE =
  'This is not a remote role. Resume generation is only allowed for remote positions.';

export function findNonRemoteWorkType(text: string): string | null {
  const match = text.match(NON_REMOTE_PATTERN);
  if (!match) return null;
  return match[1].replace(/\s+/g, ' ').toLowerCase();
}

export function isNonRemoteRole(text: string): boolean {
  return NON_REMOTE_PATTERN.test(text);
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

export function assertRemoteJobDescription(jobDescription: string): void {
  if (isNonRemoteRole(jobDescription)) {
    throw new NonRemoteRoleError(nonRemoteRoleMessage(jobDescription));
  }
}
