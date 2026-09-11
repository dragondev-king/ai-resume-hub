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
  'You are an expert resume writer. Tailor the resume for ATS keyword match and a human recruiter without inventing a new career. Put job-description keywords in the skills list and, when they are already true, in the summary and current role. Do not paste the hiring company name, product names, or unique JD programs into other employers. Keep each job\'s real stack from the original description and CURRENT SKILLS. Rephrase and reorder to emphasize overlap. Do not add languages, frameworks, or cloud products the candidate did not use at that company. Every work experience must have at least 6 bullets (6-10; 8-10 for the most recent or longer roles). No invented metrics. Wrap tech tokens in experience bullets with <b>...</b>. Never put a version in a job that ended before that version existed. Extract jobTitle and companyName from the job description for metadata only.';

const TIMELINE_SYSTEM_PROMPT = `You map technologies onto a candidate's real work history. A version must not appear in a job that ended before it existed. JD technologies belong in a role only if that role's original description or CURRENT SKILLS already include that family. Do not put required JD versions in mustUse unless the original experience already used that family. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a credibility editor. Remove invented stacks, target-company leakage, and fake metrics. Do not add new employers or change dates. Keep at least 6 bullets per role. Respond with valid JSON only.`;

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
            currentSkills: Array.isArray(profile.skills)
              ? profile.skills.filter((skill: string) => skill.trim()).join(', ')
              : '',
          });

    return res.status(200).json({
      success: true,
      aiResponse,
      provider,
      version: 'v2',
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

Build a chronology map that prevents invented stacks and anachronistic versions.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description.
2. For each, estimate when it first became available (YYYY-MM). Distinguish family vs version.
3. Also note technologies from the original work-history descriptions.
4. For each role:
   - mayUse: families that both (a) existed during that role AND (b) appear in that role's original description or are clearly in the candidate's established stack. Do not list JD-only tech the person never used.
   - mustUse: required JD versions ONLY if this is the most recent role, the role was still active after the version shipped, AND the original description already used that family. Otherwise empty.
   - mustNotUse: versions that did not exist yet, plus JD-only technologies this role never used
   - eraStackGuidance: remind the writer to keep this job's original stack
5. If the candidate never used a JD technology, it belongs in mustNotUse for every role.

Respond with ONLY JSON using the REAL company names, dates, and technologies.

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required by the JD. Include in a role only if original experience already used the family."
    }
  ],
  "roles": [
    {
      "company": "<company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family already used here>"],
      "mustUse": [],
      "mustNotUse": ["<JD-only tech>", "<Family> <Version>"],
      "eraStackGuidance": "Keep the original stack. Do not import JD-only technologies."
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
  currentSkills: string;
}): Promise<string> {
  const prompt = `TODAY'S DATE: ${params.today}

JOB DESCRIPTION (keywords only — do not copy company/product names into experience):
${params.jobDescription}

FACTUAL WORK HISTORY (original stacks and dates):
${params.workHistory}

CURRENT SKILLS:
${params.currentSkills}

STACK MAP:
${params.timeline || 'Remove any technology a role did not originally use. Versions only if the role was active after they shipped. No hiring-company names in bullets or summary.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT:
1. Keep companies, start/end dates, addresses, and the same number of roles.
2. Remove technologies, languages, and frameworks that are not in that job's original description and not in CURRENT SKILLS.
3. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
4. Remove invented percentages and metrics that were not in the original description.
5. Keep at least 6 bullets per role. Drop generic mentoring/agile/documentation filler only if a role already has more than 10 bullets.
6. Skills: keep the real CURRENT SKILLS list; add only JD aliases the candidate already has; include genuine soft skills when true; deduplicate; do not replace the list with JD-only keywords.
7. Summary: 3-4 sentences, no version numbers, no hiring-company name.
8. Keep <b>...</b> around remaining tech tokens. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned".

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
Create a professional resume for this job. Tailor keywords and emphasis. Do not rewrite the candidate into a different engineer.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates, companies, and original stacks are FACTS):
${workHistory}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

CURRENT SKILLS (keep these; add JD aliases the candidate already has; do not replace this list):
${skills.filter((skill: string) => skill.trim()).join(', ')}

VERSION / STACK MAP:
${timeline || 'Only name a JD technology in a job if that job already used that family. Versions only if the role was still active after the version shipped. Summary: family names, no versions. Never invent a stack.'}

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for title, required skills, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — tailor emphasis, freeze the stack:
   - Keep each company's original technologies from Original description and CURRENT SKILLS
   - Rewrite bullets to emphasize work that overlaps the JD, using the JD's phrasing only when it is already true (e.g. REST APIs if they built APIs)
   - Do not add Java, Spring, .NET, GraphQL, SOAP, Terraform, ATO, or any other JD-only stack to a job that did not use it
   - Do not use "scalability", "reliability", "robust", "passionate", "seasoned", "best practices", or "foster"
   - Quantify only if the original description had numbers. Do not invent 20%/25%/40%
   - Use action verbs. Prefer concrete delivery over mentoring/agile/code-review filler

3. BULLET COUNT:
   - Every role: at least 6 bullets. Typical range 6-10.
   - Most recent or longer roles: 8-10
   - Full accomplishments, not stubs. Do not invent employers, stacks, or metrics to fill space.

4. ATS KEYWORDS (this is how the resume still matches):
   - Skills list: start from CURRENT SKILLS, keep them, add JD terms the candidate already has, including exact aliases (AWS and Amazon Web Services if they have AWS)
   - Include both hard/technical skills and genuine soft skills (Leadership, Communication, Mentoring, Problem-solving, etc.) when they are true of the candidate
   - Versions may appear in the skills list for ATS (React 18) even if bullets use the family name
   - Do not add skills the candidate has never used
   - Deduplicate Vue/Vue.js, Angular/Angular.js, React/React.js

5. SUMMARY:
   - 3-4 sentences. Mirror JD language for true strengths. Family names only, no version numbers, no hiring-company name

6. JOB TITLES:
   - Slight honest alignment only (Software Engineer → Senior Software Engineer if they were senior)
   - Do not change frontend work into a backend/Java/.NET title
   - Keep company names and start/end dates exactly

7. BOLD TECH IN BULLETS:
   - Wrap technical skills/tools/frameworks/languages with <b>...</b>
   - Only wrap the token. Keep tags inside JSON strings

Respond with ONLY valid JSON. Same number of positions as original experience.

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Job title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Shipped a new feature in the lead-generation app using <b>Skill</b> and <b>Skill</b>...",
        "Integrated APIs and backend services with <b>Skill</b>..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
