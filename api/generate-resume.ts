import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateResume, resumeFunctionConfig } from './_resumeGeneration';
import { resumeVersionV1 } from './v1/generate-resume';

/** Unversioned route kept for existing clients. Same behavior as `/api/v1/generate-resume`. */
export const config = resumeFunctionConfig;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleGenerateResume(req, res, resumeVersionV1);
}
