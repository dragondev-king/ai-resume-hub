/**
 * Typed access to `job_applications.metadata` (JSON from get_job_applications_with_filters).
 */

export type JobApplicationMetadata = {
  resumeTemplateId?: string;
  aiProvider?: 'openai' | 'claude';
  resumeApiVersion?: 'v1' | 'v2';
};

export function parseJobApplicationMetadata(raw: unknown): JobApplicationMetadata {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const resumeTemplateId =
    typeof record.resumeTemplateId === 'string' && record.resumeTemplateId.trim()
      ? record.resumeTemplateId.trim()
      : undefined;
  const aiProvider =
    record.aiProvider === 'openai' || record.aiProvider === 'claude' ? record.aiProvider : undefined;
  const resumeApiVersion =
    record.resumeApiVersion === 'v1' || record.resumeApiVersion === 'v2'
      ? record.resumeApiVersion
      : undefined;
  return { resumeTemplateId, aiProvider, resumeApiVersion };
}

export function buildJobApplicationMetadata(
  partial: JobApplicationMetadata
): JobApplicationMetadata {
  const metadata: JobApplicationMetadata = {};
  if (partial.resumeTemplateId) metadata.resumeTemplateId = partial.resumeTemplateId;
  if (partial.aiProvider) metadata.aiProvider = partial.aiProvider;
  if (partial.resumeApiVersion) metadata.resumeApiVersion = partial.resumeApiVersion;
  return metadata;
}

export function getResumeTemplateIdFromMetadata(metadata: unknown): string | undefined {
  return parseJobApplicationMetadata(metadata).resumeTemplateId;
}

export function getResumeTemplateIdForApplication(application?: {
  metadata?: unknown;
}): string | undefined {
  return getResumeTemplateIdFromMetadata(application?.metadata);
}
