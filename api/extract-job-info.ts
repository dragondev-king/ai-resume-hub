import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import { JOB_TITLE_EXTRACTION_INSTRUCTIONS, normalizeJobTitle } from './_lib/jobTitlePrompt';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_JOB_DESCRIPTION_CHARS = 8000;

/**
 * Lightweight job title + company extraction used for pre-generate duplicate checks.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobDescription } = req.body || {};
    if (!jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Missing required field: jobDescription' });
    }

    const jd = jobDescription.trim().slice(0, MAX_JOB_DESCRIPTION_CHARS);

    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'Extract ONLY the hiring company name and a clean professional job title from a job description. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: `Extract companyName and jobTitle from this job description.

${JOB_TITLE_EXTRACTION_INSTRUCTIONS}

- companyName: hiring company only (e.g. "Farmers Insurance", "Stadium", "Ditto")
- Do not invent a company if unclear — return empty string

JOB DESCRIPTION:
${jd}

Respond with ONLY JSON:
{
  "companyName": "company name",
  "jobTitle": "clean job title"
}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(502).json({ error: 'Failed to extract job info' });
    }

    const parsed = JSON.parse(match[0]);
    const companyName = typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '';
    const jobTitle = normalizeJobTitle(parsed.jobTitle);

    return res.status(200).json({
      success: true,
      companyName,
      jobTitle,
    });
  } catch (error: any) {
    console.error('Error extracting job info:', error);
    return res.status(500).json({
      error: 'Failed to extract job info',
      details: error?.message || String(error),
    });
  }
}
