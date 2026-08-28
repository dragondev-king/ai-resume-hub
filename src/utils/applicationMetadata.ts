/**
 * Typed access to `job_applications.metadata` (JSON from get_job_applications_with_filters).
 */

export type JobApplicationMetadata = {
  resumeTemplateId?: string;
  /** When true, generated experience includes AI-substituted company names and role titles. */
  tailorCompanyNames?: boolean;
};

function asBooleanFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

export function parseJobApplicationMetadata(raw: unknown): JobApplicationMetadata {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as JobApplicationMetadata;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as JobApplicationMetadata;
}

export function getResumeTemplateIdFromMetadata(metadata: unknown): string | undefined {
  const id = parseJobApplicationMetadata(metadata).resumeTemplateId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

export function getResumeTemplateIdForApplication(application?: {
  metadata?: unknown;
}): string | undefined {
  return getResumeTemplateIdFromMetadata(application?.metadata);
}

export function getTailorCompanyNamesFromMetadata(metadata: unknown): boolean {
  return asBooleanFlag(parseJobApplicationMetadata(metadata).tailorCompanyNames);
}

export function getTailorCompanyNamesForApplication(application?: {
  metadata?: unknown;
}): boolean {
  return getTailorCompanyNamesFromMetadata(application?.metadata);
}
