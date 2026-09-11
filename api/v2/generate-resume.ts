import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleGenerateResume, resumeFunctionConfig } from '../../lib/resumeGeneration';
import { resumePromptsV2 } from '../../lib/resumePromptsV2';

export const config = resumeFunctionConfig;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleGenerateResume(req, res, resumePromptsV2);
}
