/**
 * Typed access to `job_applications.metadata` (JSON from get_job_applications_with_filters).
 */

export type JobApplicationMetadata = {
  resumeTemplateId?: string;
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
