/**
 * Typed access to `profiles.metadata` (JSON from get_profiles_with_details).
 */
export interface ProfileMetadata {
  useAiEnhancedJobTitle?: boolean;
  [key: string]: unknown;
}

export function parseProfileMetadata(raw: unknown): ProfileMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ProfileMetadata;
}

export function getUseAiEnhancedJobTitleFromMetadata(metadata: unknown): boolean {
  const m = parseProfileMetadata(metadata);
  if (typeof m.useAiEnhancedJobTitle === 'boolean') return m.useAiEnhancedJobTitle;
  return false;
}

export interface ProfileRowWithMetadata {
  metadata?: unknown;
}

export function getUseAiEnhancedJobTitleForProfile(profile: ProfileRowWithMetadata | null | undefined): boolean {
  return getUseAiEnhancedJobTitleFromMetadata(profile?.metadata);
}
