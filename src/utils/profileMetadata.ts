/**
 * Typed access to `profiles.metadata` (JSON from get_profiles_with_details).
 */
export interface ProfileMetadata {
  useAiEnhancedJobTitle?: boolean;
  /** When true, resume generation substitutes peer company names and junior→senior role titles. */
  tailorCompanyNames?: boolean;
  [key: string]: unknown;
}

function asBooleanFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function parseProfileMetadata(raw: unknown): ProfileMetadata {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as ProfileMetadata;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as ProfileMetadata;
}

export function getUseAiEnhancedJobTitleFromMetadata(metadata: unknown): boolean {
  return asBooleanFlag(parseProfileMetadata(metadata).useAiEnhancedJobTitle);
}

export function getTailorCompanyNamesFromMetadata(metadata: unknown): boolean {
  return asBooleanFlag(parseProfileMetadata(metadata).tailorCompanyNames);
}

export interface ProfileRowWithMetadata {
  metadata?: unknown;
}

export function getUseAiEnhancedJobTitleForProfile(profile: ProfileRowWithMetadata | null | undefined): boolean {
  return getUseAiEnhancedJobTitleFromMetadata(profile?.metadata);
}

/** Company/role tailoring runs only when this profile flag is explicitly true. */
export function getTailorCompanyNamesForProfile(profile: ProfileRowWithMetadata | null | undefined): boolean {
  return getTailorCompanyNamesFromMetadata(profile?.metadata);
}
