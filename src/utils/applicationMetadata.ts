/**
 * Typed access to `job_applications.metadata` (JSON from get_job_applications_with_filters).
 */

export type JobApplicationMetadata = {
  resumeTemplateId?: string;
  /** When true, generated experience includes AI-substituted company names and role titles. */
  tailorCompanyNames?: boolean;
};

export function parseJobApplicationMetadata(raw: unknown): JobApplicationMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
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
  return parseJobApplicationMetadata(metadata).tailorCompanyNames === true;
}

export function getTailorCompanyNamesForApplication(application?: {
  metadata?: unknown;
}): boolean {
  return getTailorCompanyNamesFromMetadata(application?.metadata);
}
