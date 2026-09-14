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
  'You are an expert resume writer. Write like a human recruiter would believe: specific projects, natural sentences, no repeated tool names. First list the required technical skills from THIS job description in jdMustHaveTech. Latest company: every jdMustHaveTech name MUST appear once, on a different real-project bullet. Other companies: each should name 1-3 of those required skills (a different subset per company), once each, on real work from that job. Do not copy the full latest-company list into every employer. Do not skip a required skill from the latest company because the original title or stack is different. Skills.hard and the summary are not a substitute. Never laundry-list 4+ tools in one sentence. Industry/domain terms stay in summary and skills. At least 5 bullets per company. Wrap an occasional tech token in experience/summary with <b>...</b>. Never wrap skill names with HTML. Extract jobTitle and companyName from the JD for metadata only.';

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
      type: 'object',
      properties: {
        hard: {
          type: 'array',
          items: { type: 'string' },
        },
        soft: {
          type: 'array',
          items: { type: 'string' },
        },
      },
      required: ['hard', 'soft'],
      additionalProperties: false,
    },
    jdMustHaveTech: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['jobTitle', 'companyName', 'summary', 'experience', 'skills', 'jdMustHaveTech'],
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
   Original description (source of projects, ownership, and stack — not a duty list to rewrite): ${exp.description || ''}`;
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
Create a tailored resume a human recruiter would believe. Real companies, dates, and projects. Required technical skills from THIS job description belong in skills.hard, in the summary, in the latest company, AND in a few other companies — not only the most recent job, and not stuffed into every bullet.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates, companies, projects, and original stacks are FACTS):
${workHistory}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

CURRENT SKILLS (inventory to draw from; still add JD must-haves to skills.hard):
${skills.filter((skill: string) => skill.trim()).join(', ')}

SKILL PLACEMENT (required — not optional):
1. Fill jdMustHaveTech with every required technical skill named in THIS job description (languages, frameworks, libraries, platforms, tools). Do not omit a required skill because the latest job title or original stack is different.
2. Exclude only soft/interpersonal skills and industry/domain phrases. Do not exclude a required technical skill just because it is common.
3. LATEST company: every jdMustHaveTech name MUST appear once, on a different real project. Skills.hard and the summary are not a substitute. If there are more required skills than bullets, add bullets (up to 8) rather than stacking tools in one sentence.
4. OTHER companies: do not leave them as tool-free generic work. Each other company should name 1-3 jdMustHaveTech skills (not the full list), once each, attached to real work from that job. Rotate which skills appear so companies do not read as copies of each other.
5. Do not clone the entire JD stack into every employer. Do not force industry/domain terms into a company in a different industry.

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for seniority, must-have technologies, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — real projects, tailored emphasis:
   - Read the original description as a source of projects: products, features, systems, integrations, migrations, and the candidate's part in them.
   - Each bullet is one project or one distinct technical contribution: who owned it, what shipped, and what changed for users or the system.
   - JD KEYWORD PLACEMENT:
     REQUIRED — latest company: every jdMustHaveTech name MUST appear by name in that company, even if the original title or stack differed. Keep real products from that job. Put each of those skills on a different bullet, once. Do not pile them into one sentence.
     REQUIRED — other companies: each should include 1-3 jdMustHaveTech names on real projects from that job. Pick a subset that can sit on that company's actual work. Use a different subset than neighboring companies.
     HARD FAIL — if the latest company is missing any jdMustHaveTech name, you failed. Skills.hard is not enough.
     HARD FAIL — if older companies have zero jdMustHaveTech names across the whole history, you failed. Spreading a few required skills into several earlier roles is required.
     Do NOT put the full required list on every employer. Do NOT force industry/domain terms into a company in a different industry.
   - ONCE PER COMPANY: after a tool is named in a role, do not name it again in that role.
   - HUMAN VOICE: lead with what shipped and who it helped. In the latest company, after each jdMustHaveTech skill is named once, remaining bullets in THAT role may have zero tool names. Other companies should still have a few skilled bullets — not five tool-free duty lines. A good coverage bullet: "Shipped a core product feature on Skill so users could finish the task without a workaround." A good follow-on bullet: "Stabilized a failing production path so users were not blocked." A bad bullet: "Developed features using Skill, Skill, Skill, Skill, and Skill."
   - If the original already names a JD tool, keep one mention and still ensure the latest company names each distinctive required skill once.
   - Lead each role with the work that best matches THIS job when that work is already in the original description.
   - Make ownership obvious. Use the strongest verb the original supports. Do not inflate "contributed" into "led."
   - Outcomes: use numbers only if they are in the original. Otherwise state a concrete qualitative result. Do not invent 20%/25%/40%.
   - Name at most one tool per bullet, and only on the bullet where it is distinctive. Different companies must read like different jobs.
   - FORBIDDEN: generic duties unless tied to a named deliverable. FORBIDDEN: "Did X using A, B, C, and D". FORBIDDEN: repeating the same two language names in most bullets of a role.
   - If the original is thin, cluster what is there into the few real pieces of work. Do not fill space with responsibilities the original never described.
   - Do not use "scalability", "reliability", "robust", "passionate", "seasoned", "best practices", or "foster".

3. BULLET COUNT:
   - Every company: at least 5 bullets. Typical 5-8 for recent or longer roles, 5-6 for earlier roles.
   - If the original names fewer than 5 projects, split those projects into distinct contributions (what shipped, how it was built, integration, data/state, reliability). Still tied to that company's real work.
   - Do not pad with generic duties to hit the count.

4. SKILLS — always both groups, tailored to THIS job:
   - Return skills as an object with hard and soft. Both arrays are REQUIRED and must be non-empty.
   - hard MUST start with the JD's must-have technologies, then other supporting skills from CURRENT SKILLS. 8-14 items.
   - This is the primary ATS list. Required JD skills belong here and in the latest company. Also spread some of those same skills into earlier companies (a few per company, not the full list).
   - Drop generic items (debugging, version control, "full-stack development") that do not help this JD.
   - soft: 3-5 distinctive interpersonal skills that are true of the candidate.
   - Plain strings only. Never wrap a skill with <b>, <br>, <bold>, markdown, or any other HTML.
   - Deduplicate aliases. Versions may appear here even if bullets use the family name.

5. SUMMARY — professional profile, not experience:
   - 2-4 sentences. Who they are, seniority, and the value they bring to THIS role.
   - MUST name the primary JD technology family as a core strength (one mention is enough). Do not recap the skills list or narrate projects.
   - FORBIDDEN in the summary: narrating specific projects, employers, or deliverables. That belongs only in Professional Experience.
   - FORBIDDEN openings that read like bullets: "Delivered…", "Enhanced…", "Migrated…", "Built X using Y, then did Z."
   - Family names only, no version numbers, no hiring-company name.

6. JOB TITLES:
   - Slight honest alignment only if seniority is already true.
   - Do not change a narrower original title into the JD title if that would be dishonest. You MAY still name required JD technologies in that role's bullets. Title stays; required tools still get placed.
   - Keep company names and start/end dates exactly.

7. BOLD TECH IN EXPERIENCE AND SUMMARY:
   - Wrap technical skills/tools/frameworks/languages with <b>...</b> inside experience description strings and the summary
   - Only wrap the token. Keep tags inside JSON strings
   - Do not wrap skills.hard or skills.soft — those are plain labels with no HTML

Respond with ONLY valid JSON. Same number of positions as original experience.

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Engineer who delivers production systems in the stack this role requires. Comfortable owning work from implementation through production support.",
  "experience": [
    {
      "position": "Most recent job title",
      "company": "Most Recent Company",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Shipped a core product feature on <b>Skill</b> so users could finish the task without a workaround.",
        "Rebuilt an existing workflow in <b>Skill</b> so the team could change it without a full rewrite.",
        "Connected <b>Skill</b> to the current system so new work matched what was already in production.",
        "Stabilized a failing production path so users were not blocked.",
        "Split a tangled module so later changes stayed isolated."
      ]
    },
    {
      "position": "Earlier job title",
      "company": "Earlier Company",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Built a shared interface in <b>Skill</b> so several apps used the same navigation.",
        "Modernized a legacy screen in <b>Skill</b> so staff could complete the workflow on one page.",
        "Fixed a production defect so users were not blocked on the main path.",
        "Tightened review of incoming changes so risky updates were caught before release.",
        "Split a crowded page into smaller pieces so later work stayed isolated."
      ]
    }
  ],
  "skills": {
    "hard": ["core technical skill 1", "core technical skill 2"],
    "soft": ["Leadership", "Communication", "Problem-solving"]
  },
  "jdMustHaveTech": ["required language or framework 1", "required framework 2"]
}
`;
};
