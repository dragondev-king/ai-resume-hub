import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

type AIProvider = 'openai' | 'claude';

export const config = {
  maxDuration: 300,
};

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

const SYSTEM_PROMPT =
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Transform the candidate\'s experience so they look like a strong fit for the target job. Write rich, specific, human bullets a recruiter would believe. Generate 7-12 bullet points per work experience (10-12 for longer or senior roles). Never write thin 4-5 bullet roles. Extract the job title and company name from the job description. Aggressively tailor job titles and descriptions while keeping company names and employment dates unchanged. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b>. Version rule: required job-description versions belong in the most recent company only, once per version; earlier companies and the summary use family names with no version number. Never put a version in a job that ended before that version existed.';

const RESUME_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    jobTitle: { type: 'string' },
    companyName: { type: 'string' },
    summary: { type: 'string' },
    experience: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          position: { type: 'string' },
          company: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          address: { type: 'string' },
          descriptions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['position', 'company', 'start_date', 'end_date', 'address', 'descriptions'],
        additionalProperties: false,
      },
    },
    skills: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['jobTitle', 'companyName', 'summary', 'experience', 'skills'],
  additionalProperties: false,
};

interface RequestBody {
  profile: any;
  jobDescription: string;
  provider?: AIProvider;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile, jobDescription, provider = 'openai' } = req.body as RequestBody;

    if (!profile || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields: profile and jobDescription' });
    }

    if (!isAIProvider(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be "openai" or "claude".' });
    }

    const configError = providerConfigError(provider);
    if (configError) {
      return res.status(500).json(configError);
    }

    const today = formatToday();
    const workHistory = formatWorkHistory(profile);

    const aiResponse = await generateResumeDraft({
      provider,
      prompt: createAIPrompt(profile, jobDescription, today, workHistory),
    });

    return res.status(200).json({
      success: true,
      aiResponse,
      provider,
    });
  } catch (error: any) {
    console.error('Error generating resume:', error);
    const details = String(error?.message || error);
    const needsWorkspaceId = details.includes('anthropic-workspace-id is required');
    return res.status(500).json({
      error: 'Failed to generate resume',
      details: needsWorkspaceId
        ? 'Claude rejected the request because this API key needs a workspace. Set ANTHROPIC_WORKSPACE_ID to the wrkspc_… ID from Claude Console → Settings → Workspaces (local .env and Vercel env).'
        : details,
    });
  }
}

function formatToday(): string {
  return new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatRoleEnd(exp: any): string {
  if (exp.current || !exp.end_date || String(exp.end_date).toLowerCase() === 'present') {
    return 'Present';
  }
  return String(exp.end_date);
}

function formatWorkHistory(profile: any): string {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  return experience
    .map((exp: any, index: number) => {
      const end = formatRoleEnd(exp);
      return `${index + 1}. ${exp.position} at ${exp.company}
   Dates (FACT — do not change): ${exp.start_date} through ${end}
   Address: ${exp.address || ''}
   Original description: ${exp.description || ''}`;
    })
    .join('\n');
}

async function generateResumeDraft(params: {
  provider: AIProvider;
  prompt: string;
}): Promise<string> {
  return generateJsonText({
    provider: params.provider,
    prompt: params.prompt,
    system: SYSTEM_PROMPT,
    schema: RESUME_OUTPUT_SCHEMA,
    temperature: 0.7,
    maxTokens: params.provider === 'claude' ? 5000 : 8000,
  });
}

const createAIPrompt = (
  profile: any,
  jobDescription: string,
  today: string,
  workHistory: string
): string => {
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  return `
Please create a highly tailored, professional resume for the following job. Position the candidate as an ideal fit. Writing quality matters as much as chronological honesty: rich bullets, full skill list, strong summary.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates and companies are FACTS — copy start_date and end_date exactly):
${workHistory}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

CURRENT SKILLS (keep these; add JD skills; do not replace this list with only a few keywords):
${skills.filter((skill: string) => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description for title, company, required skills, responsibilities, and terminology.

2. TRANSFORM each work experience to align with the target role:
   - Adjust job titles to show progression toward the target position
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include specific technologies, tools, and methodologies from the job description and from the original experience
   - Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write
   - Focus on transferable skills that apply to the target role
   - Use industry-specific language from the job description
   - Show quantifiable achievements and measurable impact where it still sounds human
   - Use action verbs. Vary the work: features, integrations, collaboration, testing, performance, mentoring, delivery

3. BULLET COUNT (REQUIRED):
   - 7-12 bullets per position. Senior or longer roles: 10-12. Never output 4-5 bullets for a role.
   - Each bullet should be a full accomplishment, not a three-word stub.

4. CREATIVE TAILORING:
   - Incorporate job-description technologies into relevant work, following the version rules below
   - Emphasize similar frameworks, methodologies, and problem-solving
   - Highlight leadership, collaboration, and delivery
   - Show the ability to learn and adapt without sounding like keyword stuffing

5. VERSION RULES (do not let these make the resume thin):
   - Pull technologies from THIS job description and from the original experience. Do not invent a default stack.
   - Summary: family names only, no version numbers. Keep it 4-6 strong sentences, not two generic lines.
   - Most recent company: each required JD version appears ONCE in the bullet list; later bullets use the family name. Other skills (TypeScript, TailwindCSS, APIs, tests, etc.) can appear throughout.
   - Earlier companies: family names for those JD technologies, no version numbers. Keep the rest of the original/relevant stack (Vue, Rails, Redux, Amplify, and so on) when it belongs to that job.
   - Never put a version in a job that ended before that version existed
   - Keep original company names and original start/end dates. Same number of positions as the original history

6. JOB TITLE STRATEGY:
   - Most recent position: closely match or sit one step below the target title
   - Previous positions: clear career progression
   - Keep company names exactly as provided

7. SKILLS LIST (REQUIRED):
   - Start from CURRENT SKILLS above. Keep them.
   - Add skills mentioned in the job description, including required versions for keyword match
   - The result should look like a senior engineer's skill section, not five keywords

8. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - Wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b>
   - Only wrap the token — not entire sentences. Do not bold soft skills
   - Keep the <b> tags inside JSON string values

Respond with ONLY valid JSON — no markdown, no extra text. Do not drop companies. Same number of positions as original experience.

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Tailored Job Title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Shipped a new feature in the lead-generation app using <b>Skill</b> and <b>Skill</b>...",
        "Integrated APIs and backend services with <b>Skill</b>...",
        "Improved UI consistency with <b>Skill</b> and cut load time by 30%..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
