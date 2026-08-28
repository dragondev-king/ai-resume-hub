/**
 * Typed access to `profiles.metadata` (JSON from get_profiles_with_details).
 */
export interface ProfileMetadata {
  useAiEnhancedJobTitle?: boolean;
  /** When true, resume generation substitutes peer company names and junior→senior role titles. */
  tailorCompanyNames?: boolean;
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

export function getTailorCompanyNamesFromMetadata(metadata: unknown): boolean {
  return parseProfileMetadata(metadata).tailorCompanyNames === true;
}

export interface ProfileRowWithMetadata {
  metadata?: unknown;
}

export function getUseAiEnhancedJobTitleForProfile(profile: ProfileRowWithMetadata | null | undefined): boolean {
  return getUseAiEnhancedJobTitleFromMetadata(profile?.metadata);
}

export function getTailorCompanyNamesForProfile(profile: ProfileRowWithMetadata | null | undefined): boolean {
  return getTailorCompanyNamesFromMetadata(profile?.metadata);
}
