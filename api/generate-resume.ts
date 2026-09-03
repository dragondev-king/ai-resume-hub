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

const TIMELINE_SYSTEM_PROMPT = `You map job-description technologies onto a candidate's real work history. A specific version must not appear in a job that ended before it existed. Required JD versions belong in mustUse for the MOST RECENT role only. Each version should be named once in that role's bullets, then family names only. All earlier roles: family name in mayUse, required version in mustNotUse. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a light copy editor. Do not rewrite the resume. Do not shorten it. Do not drop bullets or skills. Keep the same dates, companies, bullet count, and skill list length. Only fix version-number placement. Respond with valid JSON only.`;

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

const TIMELINE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    technologies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string' },
          introduced: { type: 'string' },
          confidence: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'kind', 'introduced', 'confidence', 'notes'],
        additionalProperties: false,
      },
    },
    roles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          mayUse: {
            type: 'array',
            items: { type: 'string' },
          },
          mustUse: {
            type: 'array',
            items: { type: 'string' },
          },
          mustNotUse: {
            type: 'array',
            items: { type: 'string' },
          },
          eraStackGuidance: { type: 'string' },
        },
        required: ['company', 'start_date', 'end_date', 'mayUse', 'mustUse', 'mustNotUse', 'eraStackGuidance'],
        additionalProperties: false,
      },
    },
  },
  required: ['technologies', 'roles'],
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

    // Claude is slower; three sequential calls often exceed Vercel’s limit and
    // surface as FUNCTION_INVOCATION_FAILED. Chronology rules stay in the main prompt.
    const timeline =
      provider === 'claude'
        ? ''
        : await analyzeTechnologyTimeline({
            provider,
            jobDescription,
            workHistory,
            today,
          });

    const draft = await generateResumeDraft({
      provider,
      prompt: createAIPrompt(profile, jobDescription, timeline, today, workHistory),
    });

    const aiResponse =
      provider === 'claude'
        ? draft
        : await auditResumeChronology({
            provider,
            draft,
            timeline,
            workHistory,
            jobDescription,
            today,
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

async function analyzeTechnologyTimeline(params: {
  provider: AIProvider;
  jobDescription: string;
  workHistory: string;
  today: string;
}): Promise<string> {
  const prompt = `TODAY'S DATE: ${params.today}

JOB DESCRIPTION:
${params.jobDescription}

CANDIDATE WORK HISTORY (dates are facts):
${params.workHistory}

Build a chronology map. Required job-description versions may be named in the MOST RECENT role only.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description. Use whatever names and versions the JD actually lists.
2. For each, estimate when it first became available (YYYY-MM).
3. Distinguish family names from versions. "<Family>" is not "<Family> <Version>".
4. Identify the most recent work-history role (latest end date, or Present).
5. For each role, list:
   - mayUse: family names that existed during that role — not version numbers, except as below
   - mustUse: required JD versions for the MOST RECENT role only, and only if that role was still active after the version shipped. Empty for every earlier role.
   - mustNotUse: required JD versions for every role except that one most-recent eligible role
   - eraStackGuidance: most recent eligible role should name each required version once in the whole bullet list; remaining bullets and all other roles use the family name with no version number
6. If the most recent role ended before the version existed, mustUse is empty everywhere. Do not assign the version to an older company.

Respond with ONLY JSON using the REAL company names and dates from the work history above, and the REAL technologies from the job description. The following is the shape only — copy structure, not these placeholders:

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required by the JD. Name it only in the most recent role if that role was still active after introduced."
    }
  ],
  "roles": [
    {
      "company": "<most recent company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family>", "<Family> <Version>"],
      "mustUse": ["<Family> <Version>"],
      "mustNotUse": [],
      "eraStackGuidance": "Most recent role and dates allow the required version. This is the ONLY role that should name it."
    },
    {
      "company": "<earlier company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family>"],
      "mustUse": [],
      "mustNotUse": ["<Family> <Version>"],
      "eraStackGuidance": "Write the family name only. No version numbers."
    }
  ]
}`;

  try {
    return await generateJsonText({
      provider: params.provider,
      prompt,
      system: TIMELINE_SYSTEM_PROMPT,
      schema: TIMELINE_OUTPUT_SCHEMA,
      temperature: 0.2,
      maxTokens: 4000,
    });
  } catch (error) {
    console.error('Technology timeline analysis failed; continuing with prompt-only chronology rules:', error);
    return '';
  }
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

async function auditResumeChronology(params: {
  provider: AIProvider;
  draft: string;
  timeline: string;
  workHistory: string;
  jobDescription: string;
  today: string;
}): Promise<string> {
  const prompt = `TODAY'S DATE: ${params.today}

JOB DESCRIPTION (for tailoring context, not for copying into old jobs):
${params.jobDescription}

FACTUAL WORK HISTORY DATES:
${params.workHistory}

TECHNOLOGY TIMELINE (follow this):
${params.timeline || 'Required JD versions may be named in the most recent company only, and only if that role was still active after the version shipped. Summary: family names only, no versions. Earlier jobs: family names, no version numbers.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT AND REWRITE:
This is a surgical edit, not a rewrite. Quality of the draft must stay the same or improve.

1. Keep the same companies, start/end dates, addresses, positions, number of roles, and JSON shape.
2. Keep EVERY bullet. Do not delete bullets. Do not merge bullets. If a role has 8 bullets, it still has 8. Prefer 7-12 per role; if a role is already under 7, leave the count as-is unless you can add substance without inventing new employers.
3. Keep the full skills list. Add missing job-description skills if needed. Never shrink a long list down to only a few JD keywords.
4. Professional summary: keep length and strength. Remove version numbers only (Family Version → Family). Do not make the summary shorter or generic.
5. Experience versions: a required version from THIS job description may appear only in the most recent company, once per version. Other bullets at that company use the family name. Earlier companies: family name, no version number. Do not strip other technologies, tools, or details.
6. Do not change employment dates.
7. Keep <b>...</b> around tech tokens. Sound human. No "scalability"/"reliability"/"robust".

Respond with ONLY the corrected resume JSON in this shape:
{
  "jobTitle": "...",
  "companyName": "...",
  "summary": "...",
  "experience": [
    {
      "position": "...",
      "company": "...",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "...",
      "descriptions": ["..."]
    }
  ],
  "skills": ["..."]
}`;

  try {
    return await generateJsonText({
      provider: params.provider,
      prompt,
      system: AUDIT_SYSTEM_PROMPT,
      schema: RESUME_OUTPUT_SCHEMA,
      temperature: 0.2,
      maxTokens: 8000,
    });
  } catch (error) {
    console.error('Chronology audit failed; returning draft resume:', error);
    return params.draft;
  }
}

const createAIPrompt = (
  profile: any,
  jobDescription: string,
  timeline: string,
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

VERSION MAP (placement only — do not use this to shrink the resume):
${timeline || 'Required JD versions: name them once in the most recent company if that role was still active after the version shipped. Summary and earlier jobs: family name only.'}

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
   - Incorporate job-description technologies into relevant work, following the version map below
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
