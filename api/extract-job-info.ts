import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const JOB_TITLE_EXTRACTION_INSTRUCTIONS = `
JOB TITLE EXTRACTION (STRICT):
- Return ONLY a clear professional role title people would put on a resume.
- Prefer the official posted title near the top of the JD (page/header title), not body sentences.
- Good examples: "Cloud Platform Engineer", "Senior JavaScript Developer", "Senior Android Engineer", "Senior Software Engineer"
- Convert specialty postings into normal titles:
  - "Senior Javascript Developer - React" → "Senior JavaScript Developer"
  - "Senior Software Engineer, Android" → "Senior Android Engineer"
  - "Cloud Platform Engineer Job Details | Farmers Insurance Careers" → "Cloud Platform Engineer"
- NEVER return:
  - Body prose ("As a Senior Frontend Developer (React.js / Next.js), you will…")
  - Incomplete fragments with leftover parentheses ("… (React.js")
  - ATS/page chrome ("Job Details", "| Company Careers", "FAIR MATCH", locations, salary, remote/full-time badges)
  - Company name glued onto the title
- Keep Title Case. No pipes, dashes to company names, or marketing suffixes.
`.trim();

const MAX_JOB_DESCRIPTION_CHARS = 8000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        details:
          'OpenAI API key is not configured. Please set OPENAI_API_KEY in the Vercel dashboard.',
      });
    }

    const { jobDescription } = req.body || {};
    if (!jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
      return res.status(400).json({ error: 'Missing required field: jobDescription' });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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
      max_completion_tokens: 200,
    });

    const raw = completion.choices[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return res.status(502).json({ error: 'Failed to extract job info' });
    }

    const parsed = JSON.parse(match[0]);
    const companyName = typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '';
    const jobTitle =
      typeof parsed.jobTitle === 'string' ? parsed.jobTitle.replace(/\s+/g, ' ').trim() : '';

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
