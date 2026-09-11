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
  'You are an expert resume writer for senior technical hiring. Recruiters reject generic duty lists and broad skill dumps. Write each role around the actual projects, products, and technical contributions in that job\'s original description. Show ownership, what shipped, and the outcome. Every company must have at least 5 bullets. Put ATS keywords in a short, focused skills list and a specific summary — not in every bullet. Each role may name only technologies from THAT role\'s original description. Do not pair competing technologies unless both appear in that original text. Do not invent metrics, employers, or stacks. Wrap tech tokens in bullets with <b>...</b>. Extract jobTitle and companyName from the JD for metadata only.';

const TIMELINE_SYSTEM_PROMPT = `You extract the real projects and allowed technologies for each job from the original work-history description. A JD technology belongs in a role only if THAT role's original description already names that family. CURRENT SKILLS must not be copied into mayUse. Competing technologies are not a default pair. Versions must not appear in a job that ended before they existed. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a credibility and signal editor. Delete generic duties, cloned JD stacks, fake metrics, and hiring-company leakage. Keep project-based bullets that show ownership, what shipped, and the outcome. Every role must keep at least 5 bullets — split real projects into distinct contributions if needed, do not pad with generic duties. Tighten the skills list to core strengths for this role. Do not add employers or change dates. Respond with valid JSON only.`;

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
          projects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                shipped: { type: 'string' },
                stack: {
                  type: 'array',
                  items: { type: 'string' },
                },
                ownership: { type: 'string' },
              },
              required: ['name', 'shipped', 'stack', 'ownership'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'company',
          'start_date',
          'end_date',
          'mayUse',
          'mustUse',
          'mustNotUse',
          'eraStackGuidance',
          'projects',
        ],
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
   Original description (source of projects, ownership, and stack — not a duty list to rewrite): ${exp.description || ''}`;
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

Build a project-and-stack map. The writer will turn these projects into resume bullets. Do not invent stacks or anachronistic versions.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description.
2. For each, estimate when it first became available (YYYY-MM). Distinguish family vs version.
3. From each role's original description, extract the real work as projects: named products, features, systems, integrations, or migrations. If the text has no product name, cluster related work into a project (search, APIs, billing, automation) without inventing a client or product the original did not mention.
4. For each role:
   - projects: at least 5 items (5-8). Split a large product into distinct contributions (feature, integration, data/state, API, UI, reliability) if the original only names one system. name = short project/product/feature; shipped = what was delivered; stack = tools NAMED in that original description for this work; ownership = strongest level the original supports (owned, led, built, contributed — do not inflate).
   - mayUse: families that both (a) existed during that role AND (b) are NAMED in that role's original description. Do not copy CURRENT SKILLS or the JD stack here.
   - mustUse: required JD versions ONLY if this is the most recent role, the role was still active after the version shipped, AND the original description already used that family. Otherwise empty.
   - mustNotUse: versions that did not exist yet; JD-only technologies this role never named; competing technologies this role did not name.
   - eraStackGuidance: keep this job's original stack. Write bullets around projects, not around a technology laundry list.
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
      "eraStackGuidance": "Keep only technologies named in this role's original description. Write bullets around the projects below, not a cloned JD stack.",
      "projects": [
        {
          "name": "<product, feature, or system from original description>",
          "shipped": "<what was delivered>",
          "stack": ["<tool named in original>"],
          "ownership": "<owned | led | built | contributed>"
        }
      ]
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

FACTUAL WORK HISTORY (projects, original stacks, and dates):
${params.workHistory}

CURRENT SKILLS:
${params.currentSkills}

PROJECT AND STACK MAP:
${params.timeline || 'Write bullets around projects and products in each original description. Remove any technology a role did not name. CURRENT SKILLS is not an overlay. Competing technologies are not a default pair. No hiring-company names in bullets or summary.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT:
1. Keep companies, start/end dates, addresses, and the same number of roles.
2. Each bullet must be a project, product, feature, system, or integration from that job's original description. Delete generic duties: collaborated, participated in agile, wrote documentation, performed testing, translated requirements, unless the sentence names a specific deliverable and outcome.
3. Show ownership (owned / led / built / contributed — only as strong as the original supports), what shipped, and the result for users or the system. Do not invent percentages or metrics.
4. Remove any technology not NAMED in that job's original description. CURRENT SKILLS is not a reason to keep a technology in a past job.
5. If two or more roles use the same 3+ technology list in a bullet, rewrite those bullets around different projects.
6. Competing technologies must not appear in the same role unless BOTH are in that role's original description.
7. Delete laundry-list bullets of the form "Did X using A, B, C, and D to support Y".
8. Delete JD-only tools from a role unless that role's original description mentioned them.
9. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
10. Every role must have at least 5 bullets. Typical 5-8 for recent or longer roles, 5-6 for earlier roles. If a role has fewer than 5, split real projects into distinct contributions. Do not drop below 5. Do not pad with generic duties.
11. Skills: a focused core-strengths list for THIS job, not a dump. Lead with overlap that is already true. Drop generic items and tools that do not support the target role. About 8-14 hard skills and 2-4 distinctive soft skills. Do not add skills the candidate has never used.
12. Summary: 2-4 sentences stating the specific value for this role, backed by real projects. No version numbers, no hiring-company name, no generic "experienced engineer with many technologies."
13. Keep <b>...</b> around remaining tech tokens. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned"/"best practices"/"foster".

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
Create a resume a senior recruiter can scan in 20 seconds: specific projects, clear ownership, real outcomes, and a tight skills list. Do not rewrite the candidate into a different engineer.

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

CURRENT SKILLS (candidate inventory — select a focused subset for the skills section; do not paste into every job):
${skills.filter((skill: string) => skill.trim()).join(', ')}

PROJECT AND STACK MAP:
${timeline || 'Name a technology in a job only if that job\'s original description already used it. Write experience around projects in the original description, not generic duties. Competing technologies are not a default pair. Never invent a stack.'}

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for seniority, core technical strengths it cares about, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — projects during those company years, not a duty list:
   - Read the original description as a source of projects: products, features, systems, integrations, migrations, and the candidate's part in them.
   - Each bullet is one project or one distinct technical contribution inside a project: who owned it, what shipped, and what changed for users or the system.
   - Lead each role with the work that best matches THIS job's core strengths, but only if that work is already in the original description.
   - Make ownership obvious. Use the strongest verb the original supports. Do not inflate "contributed" into "led."
   - Outcomes: use numbers only if they are in the original. Otherwise state a concrete qualitative result (what people or systems could do after). Do not invent 20%/25%/40%.
   - The stack for a job is ONLY what that job's original description names. CURRENT SKILLS is not an overlay.
   - Name at most one or two tools per bullet, and only when they belong to that project. Different companies must read like different jobs.
   - Competing technologies belong in one job only if the original description used both.
   - FORBIDDEN: generic duties (collaborated with teams, participated in agile, wrote documentation, performed testing, translated requirements) unless tied to a named deliverable. FORBIDDEN: "Did X using A, B, C, and D to support Y."
   - If the original is thin, cluster what is there into the few real pieces of work. Do not fill space with responsibilities the original never described. Do not upgrade a narrower role into the JD's full stack.
   - Do not add any JD-only language, framework, cloud, or product to a job that did not use it.
   - Do not use "scalability", "reliability", "robust", "passionate", "seasoned", "best practices", or "foster".

3. BULLET COUNT:
   - Every company: at least 5 bullets. Typical 5-8 for recent or longer roles, 5-6 for earlier roles.
   - If the original names fewer than 5 projects, split those projects into distinct contributions (what shipped, how it was built, integration, data/state, reliability). Still tied to that company's real work.
   - Do not pad with generic duties to hit the count.

4. SKILLS — core strengths, not a catalog:
   - Select from CURRENT SKILLS. Lead with the overlap this JD actually needs and the candidate already has.
   - About 8-14 hard skills. Drop generic items (debugging, version control, "full-stack development") and tools that do not support the target role.
   - 2-4 distinctive soft skills only if they are true. Do not add skills the candidate has never used.
   - Add JD aliases only when they name something already in CURRENT SKILLS. Deduplicate aliases.
   - Versions may appear here even if bullets use the family name.

5. SUMMARY:
   - 2-4 sentences. Specific value for THIS role, backed by real projects and ownership — not a generic years-and-tech dump.
   - Family names only, no version numbers, no hiring-company name.
   - Mention at most two or three core strengths. Do not recap the entire skills list.

6. JOB TITLES:
   - Slight honest alignment only if seniority is already true.
   - Do not change a frontend or otherwise narrower role into an unrelated backend or JD title.
   - Keep company names and start/end dates exactly.

7. BOLD TECH IN BULLETS:
   - Wrap technical skills/tools/frameworks/languages with <b>...</b>
   - Only wrap the token. Keep tags inside JSON strings

Respond with ONLY valid JSON. Same number of positions as original experience.

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Specific value for this role, backed by real projects...",
  "experience": [
    {
      "position": "Job title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Owned the search work — shipped filters with <b>Skill</b> so users could find records without leaving the page.",
        "Built a status API so operations could see failed requests the same day.",
        "Integrated the new screens with existing services so the proof of concept could run without a rewrite.",
        "Hardened state handling on the unfinished app so data survived navigation and refresh.",
        "Closed production defects on the same product so the release stayed on schedule."
      ]
    }
  ],
  "skills": ["core skill 1", "core skill 2", "core skill 3"]
}
`;
};
