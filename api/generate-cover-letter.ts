import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

type AIProvider = 'openai' | 'claude';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropicWorkspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
const CLAUDE_MODEL = 'claude-sonnet-4-6';

function isAIProvider(value: unknown): value is AIProvider {
  return value === 'openai' || value === 'claude';
}

function providerConfigError(provider: AIProvider): { error: string; details: string } | null {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return {
      error: 'Server configuration error',
      details: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.',
    };
  }
  if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
    return {
      error: 'Server configuration error',
      details: 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY environment variable.',
    };
  }
  if (provider === 'claude' && !anthropicWorkspaceId) {
    return {
      error: 'Server configuration error',
      details:
        'Anthropic workspace ID is not configured. Set ANTHROPIC_WORKSPACE_ID to the wrkspc_… ID from Claude Console → Settings → Workspaces.',
    };
  }
  return null;
}

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(anthropicWorkspaceId
      ? { defaultHeaders: { 'anthropic-workspace-id': anthropicWorkspaceId } }
      : {}),
  });
}

function extractClaudeTextContent(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

async function generatePlainText(params: {
  provider: AIProvider;
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<string> {
  if (params.provider === 'claude') {
    const message = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }],
    });
    return extractClaudeTextContent(message);
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
    max_completion_tokens: params.maxTokens,
  });

  return completion.choices[0]?.message?.content || '';
}

async function generateJsonText(params: {
  provider: AIProvider;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  temperature?: number;
}): Promise<string> {
  if (params.provider === 'claude') {
    const message = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.prompt }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: params.schema,
        },
      },
    });
    return extractClaudeTextContent(message);
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
    response_format: { type: 'json_object' },
    ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
    max_tokens: params.maxTokens,
  });

  return completion.choices[0]?.message?.content || '';
}

interface RequestBody {
  profile: any;
  jobDescription: string;
  resumeContent: any;
  provider?: AIProvider;
}

const COVER_LETTER_SYSTEM =
  "You are a professional cover letter writer. Generate concise, compelling, personalized cover letters that highlight the candidate's relevant experience and skills for the specific job. The cover letter should be professional, engaging, and demonstrate why the candidate is the perfect fit for the position. Keep responses brief and impactful - avoid unnecessary verbosity.";

const JOB_INFO_SCHEMA = {
  type: 'object',
  properties: {
    jobTitle: { type: 'string' },
    companyName: { type: 'string' },
  },
  required: ['jobTitle', 'companyName'],
  additionalProperties: false,
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile, jobDescription, resumeContent, provider = 'openai' } = req.body as RequestBody;

    if (!profile || !jobDescription || !resumeContent) {
      return res.status(400).json({
        error: 'Missing required fields: profile, jobDescription, and resumeContent',
      });
    }

    if (!isAIProvider(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be "openai" or "claude".' });
    }

    const configError = providerConfigError(provider);
    if (configError) {
      return res.status(500).json(configError);
    }

    const prompt = createCoverLetterPrompt(profile, jobDescription, resumeContent);
    const coverLetterContent = await generatePlainText({
      provider,
      system: COVER_LETTER_SYSTEM,
      prompt,
      maxTokens: 1500,
    });

    const jobInfo = await extractJobInfo(jobDescription, resumeContent, provider);

    return res.status(200).json({
      success: true,
      content: coverLetterContent,
      jobTitle: jobInfo.jobTitle,
      companyName: jobInfo.companyName,
      provider,
    });
  } catch (error: any) {
    console.error('Error generating cover letter:', error);
    const details = String(error?.message || error);
    const needsWorkspaceId = details.includes('anthropic-workspace-id is required');
    return res.status(500).json({
      error: 'Failed to generate cover letter',
      details: needsWorkspaceId
        ? 'Claude rejected the request because this API key needs a workspace. Set ANTHROPIC_WORKSPACE_ID.'
        : details,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

const createCoverLetterPrompt = (profile: any, jobDescription: string, resumeContent: any): string => {
  return `
Please write a compelling cover letter for the following job application:

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Title: ${profile.title || ''}
Email: ${profile.email}
Location: ${profile.location || ''}
LinkedIn: ${profile.linkedin || ''}
Portfolio: ${profile.portfolio || ''}

CANDIDATE'S BACKGROUND:
Summary: ${profile.summary || ''}

EXPERIENCE:
${profile.experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description || ''}
`).join('\n')}

EDUCATION:
${profile.education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

SKILLS:
${profile.skills.filter((skill: string) => skill.trim()).join(', ')}

AI-GENERATED RESUME CONTENT:
Summary: ${resumeContent.summary || ''}
Enhanced Experience: ${JSON.stringify(resumeContent.experience || [], null, 2)}
Enhanced Skills: ${resumeContent.skills ? resumeContent.skills.join(', ') : ''}

Please write a professional cover letter that:
1. Addresses the specific job requirements from the job description
2. Highlights the candidate's most relevant experience and skills
3. Demonstrates enthusiasm for the position and company
4. Explains why the candidate is the perfect fit
5. Includes specific examples from their experience
6. Maintains a professional yet engaging tone
7. Is approximately 50-70 words (keep it concise and impactful)
8. Uses the candidate's actual name and background information
9. References specific aspects of the job description

The cover letter should be well-structured with:
- Professional greeting
- Brief opening paragraph (1-2 sentences)
- 1-2 body paragraphs highlighting relevant experience (keep each paragraph short)
- Strong closing paragraph (1-2 sentences)
- Professional sign-off

Please write the cover letter in a natural, conversational tone that sounds authentic to the candidate. Be concise and avoid unnecessary verbosity.
Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write
Avoid examples that are too close to the job's tech stack because it'll be obvious the cover letter was AI generated.
CHRONOLOGY: Only mention technologies in connection with jobs/dates where those technologies already existed. Do not claim years of experience with a tool that exceed how long it has existed (e.g. do not say long-term Angular 21 experience if Angular 21 is new). Follow the dates on the AI-generated resume content.
`;
};

const extractJobInfo = async (
  jobDescription: string,
  resumeContent: any,
  provider: AIProvider
): Promise<{ jobTitle: string; companyName: string }> => {
  const jobTitle = typeof resumeContent?.jobTitle === 'string' ? resumeContent.jobTitle.trim() : '';
  const companyName = typeof resumeContent?.companyName === 'string' ? resumeContent.companyName.trim() : '';
  if (jobTitle && companyName) {
    return { jobTitle, companyName };
  }

  try {
    const aiResponse = await generateJsonText({
      provider,
      system:
        'You are an expert at extracting job information from job descriptions. Extract the job title and company name from the provided job description. If the information is not clearly stated, make your best educated guess based on the context. You MUST respond with ONLY valid JSON - no additional text, explanations, or markdown formatting.',
      prompt: `Please extract the job title and company name from this job description. If not explicitly stated, infer from context:

${jobDescription}

Respond with ONLY valid JSON in this exact format:
{
  "jobTitle": "extracted or inferred job title",
  "companyName": "extracted or inferred company name"
}`,
      schema: JOB_INFO_SCHEMA,
      temperature: 0.3,
      maxTokens: 200,
    });

    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in job info response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      jobTitle: parsed.jobTitle || jobTitle,
      companyName: parsed.companyName || companyName,
    };
  } catch (error) {
    console.error('Error extracting job info:', error);
    return { jobTitle, companyName };
  }
};
