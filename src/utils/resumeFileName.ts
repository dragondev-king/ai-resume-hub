export type ResumeDownloadFormat = 'docx' | 'pdf';

export function buildResumeFileName(
  profile: { first_name: string; last_name: string; resume_filename_format?: string },
  jobTitle: string | undefined,
  companyName: string | undefined,
  extension: ResumeDownloadFormat
): string {
  const format = profile.resume_filename_format || 'first_last';
  const base =
    format === 'first_last_job_company' && jobTitle && companyName
      ? `${profile.first_name}_${profile.last_name}_${jobTitle}-${companyName}`
      : `${profile.first_name}_${profile.last_name}`;
  return `${base}.${extension}`;
}
