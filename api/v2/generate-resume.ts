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
  'You are an expert resume writer. Tailor for ATS in the skills list and summary, not by cloning the job-description stack into every past job. Each role may name only technologies from THAT role\'s original description. CURRENT SKILLS is for the skills section, not a license to paste the candidate\'s full toolkit into every employer. Do not pair competing technologies in one job unless both appear in that job\'s original description. Do not start every role with the same laundry-list of languages and frameworks. Vary bullets. No hiring-company names in other employers. No invented metrics. At least 6 bullets per role (6-10; 8-10 most recent). Wrap tech tokens in bullets with <b>...</b>. Extract jobTitle and companyName from the JD for metadata only.';

const TIMELINE_SYSTEM_PROMPT = `You map technologies onto a candidate's real work history. A version must not appear in a job that ended before it existed. A JD technology belongs in a role only if THAT role's original description already names that family. CURRENT SKILLS must not be copied into mayUse for every job. Competing technologies (two backends, two clouds, two frontend frameworks) are not a default pair. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a credibility editor. Strip cloned JD stacks, laundry-list bullets, invented backends, target-company leakage, and fake metrics. Each role keeps only technologies from its original description. Do not add new employers or change dates. Keep at least 6 bullets per role. Respond with valid JSON only.`;

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

Build a chronology map that prevents invented stacks, cloned JD stacks, and anachronistic versions.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description.
2. For each, estimate when it first became available (YYYY-MM). Distinguish family vs version.
3. Also note technologies named in each role's original work-history description. That list is the only stack for that role.
4. For each role:
   - mayUse: families that both (a) existed during that role AND (b) are NAMED in that role's original description. Do not copy CURRENT SKILLS or the JD stack here.
   - mustUse: required JD versions ONLY if this is the most recent role, the role was still active after the version shipped, AND the original description already used that family. Otherwise empty.
   - mustNotUse: versions that did not exist yet; JD-only technologies this role never named; competing technologies this role did not name (if original names one backend, one cloud, or one frontend framework, put the unused alternatives here)
   - eraStackGuidance: keep this job's original stack. Do not write "using A, B, C, and D" unless all of those tools are in the original description.
5. If a role's original description does not name a given class of tool (backend language, cloud, database), do not put JD tools of that class in mayUse.
6. If the candidate never used a JD technology, it belongs in mustNotUse for every role.

Respond with ONLY JSON using the REAL company names, dates, and technologies.

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required by the JD. Include in a role only if THAT role's original description already named the family. Not from CURRENT SKILLS."
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
      "eraStackGuidance": "Keep only technologies named in this role's original description. Do not clone the JD stack. Do not pair competing technologies unless both were originally used here."
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
${params.timeline || 'Remove any technology a role did not name in its original description. CURRENT SKILLS is not an overlay. Competing technologies are not a default pair. No hiring-company names in bullets or summary.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT:
1. Keep companies, start/end dates, addresses, and the same number of roles.
2. Remove any technology not NAMED in that job's original description. CURRENT SKILLS is not a reason to keep a technology in a past job.
3. If two or more roles use the same 3+ technology list in a bullet, rewrite those bullets. Each role keeps only its original stack.
4. Competing technologies (two backends, two clouds, two frontend frameworks, two databases) must not appear in the same role unless BOTH are in that role's original description.
5. Delete laundry-list bullets of the form "Did X using A, B, C, and D to support Y". Name at most one or two tools per bullet, and only if they belong to that accomplishment.
6. Delete JD-only tools from a role unless that role's original description mentioned them. Those belong in Skills when true.
7. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
8. Remove invented percentages and metrics that were not in the original description.
9. Keep at least 6 bullets per role. Drop generic mentoring/agile/documentation filler only if a role already has more than 10 bullets.
10. Skills: keep CURRENT SKILLS; add JD aliases the candidate already has; include genuine soft skills when true; this is where the candidate's full toolkit may appear together.
11. Summary: 3-4 sentences, no version numbers, no hiring-company name. Summary may mention the overall stack once; experience must not copy that sentence into every job.
12. Keep <b>...</b> around remaining tech tokens. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned".

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

CURRENT SKILLS (skills SECTION only — do not paste this list into every job's bullets):
${skills.filter((skill: string) => skill.trim()).join(', ')}

VERSION / STACK MAP:
${timeline || 'Name a technology in a job only if that job\'s original description already used it. Do not copy CURRENT SKILLS into every role. Competing technologies are not a default pair. Never invent a stack.'}

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for title, required skills, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — freeze the per-job stack:
   - The stack for a job is ONLY what that job's Original description names. CURRENT SKILLS is not an overlay.
   - Keep tools the original text names. Do not add other languages, frameworks, clouds, or AI tools from the JD or CURRENT SKILLS unless they are in that original text.
   - Competing technologies (two backends, two clouds, two frontend frameworks, two databases) belong in one job only if the original description used both.
   - FORBIDDEN pattern (do not write this, or close variants, for every role): "Did X using A, B, C, and D to support Y."
   - At most one or two technologies per bullet. Most bullets should describe the work and name a tool only when it is specific to that bullet.
   - Do not repeat the same technology list across roles. Different companies should read like different jobs.
   - If original description is thin, write concrete work from the title/company context without dumping the JD stack. Do not upgrade a narrower role into the JD's full stack.
   - Tools that appear only in the JD go in Skills when they are already true of the candidate. Put them in a role only if that original description mentioned them.
   - Rewrite to emphasize overlap with the JD only when that overlap is already true for that job.
   - Do not add any JD-only language, framework, cloud, or product to a job that did not use it
   - Do not use "scalability", "reliability", "robust", "passionate", "seasoned", "best practices", or "foster"
   - Quantify only if the original description had numbers. Do not invent 20%/25%/40%
   - Use action verbs. Prefer concrete delivery over mentoring/agile/code-review filler

3. BULLET COUNT:
   - Every role: at least 6 bullets. Typical range 6-10.
   - Most recent or longer roles: 8-10
   - Fill space with distinct accomplishments, not by repeating the same four technologies.

4. ATS KEYWORDS (skills and summary, not every bullet):
   - Skills list: start from CURRENT SKILLS, keep them, add JD terms the candidate already has, including exact aliases (a vendor acronym and its full name if they already have that skill)
   - This is where the candidate's full toolkit may appear together if those skills are real
   - Include genuine soft skills (Leadership, Communication, Mentoring, Problem-solving) when true
   - Versions may appear in the skills list for ATS even if bullets use the family name
   - Do not add skills the candidate has never used
   - Deduplicate aliases (a library and its .js name, a cloud vendor and its full name)

5. SUMMARY:
   - 3-4 sentences. Mirror JD language for true strengths. Family names only, no version numbers, no hiring-company name
   - Mention the overall stack at most once here. Do not copy that sentence into experience.

6. JOB TITLES:
   - Slight honest alignment only (Software Engineer → Senior Software Engineer if they were senior)
   - Do not change a frontend or otherwise narrower role into an unrelated backend or JD title
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
        "Shipped a new feature using <b>Skill</b> so users could complete the workflow faster.",
        "Built APIs with <b>Skill</b> for order capture and status updates."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
