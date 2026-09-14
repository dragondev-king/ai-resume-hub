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
  'You are an expert resume writer. Write like a human recruiter would believe: specific projects, natural sentences, almost no repeated tool names. Required JD technical skills must appear in skills.hard, in the summary, and somewhere in the LATEST company — each distinctive skill ONCE per company, not in every bullet. Most bullets name zero tools and describe the work. Never write "using JavaScript and TypeScript" on line after line. Never laundry-list 4+ tools in one sentence. Keep the latest company\'s real products; attach JD frameworks to those projects once each. Optional in other appropriate companies. Do not clone the JD stack into every employer. Industry/domain terms stay in summary and skills. At least 5 bullets per company. Wrap an occasional tech token in experience/summary with <b>...</b>. Never wrap skill names with HTML. Extract jobTitle and companyName from the JD for metadata only.';

const TIMELINE_SYSTEM_PROMPT = `You map projects and technologies. Latest role mustUse lists required JD technical skills for coverage, but the writer may name each one only once in that role. Other same-lane roles may include them in mayUse. Unrelated roles mustNotUse JD-only tools. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a human-voice editor. Strip repeated tool names. In each company, a given technology may appear at most once. Delete JavaScript/TypeScript/HTML/CSS/Git from extra bullets in the same role. Split laundry-list bullets that name 4+ tools. Most bullets should have no tool names. Latest company as a whole must still contain each required distinctive JD skill (frameworks and languages the JD hinges on) exactly once. Do not copy those tools into every employer. Summary is a profile. Skills.hard leads with JD must-haves. No fake metrics. No hiring-company leakage. Respond with valid JSON only.`;

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

Build a project-and-stack map for a tailored resume. Real projects stay real. Required JD technologies MUST appear in the latest company, and MAY appear in other same-lane companies.

INSTRUCTIONS:
1. Extract must-have technologies from THIS job description (title + required qualifications), plus versioned products.
2. For each, estimate when it first became available (YYYY-MM). Distinguish family vs version.
3. From each role's original description, extract the real work as projects: named products, features, systems, integrations, or migrations. If the text has no product name, cluster related work into a project without inventing a client or product the original did not mention.
4. Latest role (most recent dates): mustUse = EVERY required JD technical skill (languages, frameworks, CSS libraries, git tools). Do this even if the original title is frontend and the JD wants backend, or the original used a competing library. Industry/domain terms (a specific industry) are NOT required in mustUse. Versions that did not exist yet stay out.
5. Other roles in the same lane: those JD technical families may go in mayUse. Optional — not every such role.
6. Roles in a clearly different lane: JD-only families go in mustNotUse. The latest role is never "different lane" for this purpose.
7. For each role:
   - projects: at least 5 items (5-8). Split a large product into distinct contributions if the original only names one system.
   - mayUse: families NAMED in that role's original description, plus optional same-lane JD families (see 5), plus mustUse for this role.
   - mustUse: latest role always gets all required JD technical families. Other roles: empty unless the original already named that family.
   - mustNotUse: versions that did not exist yet; JD must-haves that do not belong in this lane.
   - eraStackGuidance: keep this job's original projects. If mustUse or optional JD families apply, weave them into one or two existing projects — do not rewrite the whole job.
8. Do not put JD-only technologies in mustUse for every role. Latest company is required; additional same-lane companies are optional.

Respond with ONLY JSON using the REAL company names, dates, and technologies.

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required technical skill. Latest role mustUse always. Optional mayUse on other same-lane roles. Never skip the latest role."
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
      "eraStackGuidance": "Latest role: keep real products. Name each required distinctive JD skill once, on separate bullets. Do not repeat baseline languages on every line.",
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
${params.timeline || 'Keep original projects per company. Each JD must-have technology belongs in skills, the summary, and the latest company. It may also appear in other same-lane companies. Not every employer. No hiring-company names.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT:
1. Keep companies, start/end dates, addresses, and the same number of roles.
2. Each bullet must be a project, product, feature, system, or integration from that job's original description. Delete generic duties: collaborated, participated in agile, wrote documentation, performed testing, translated requirements, unless the sentence names a specific deliverable and outcome.
3. Show ownership (owned / led / built / contributed — only as strong as the original supports), what shipped, and the result for users or the system. Do not invent percentages or metrics.
4. The latest company as a WHOLE must name each distinctive required JD skill once. Do not strip those once-each placements. Do not leave them repeated on every bullet.
5. If a technology appears more than once in the same company, keep the strongest mention and remove the rest.
6. In the latest company, required distinctive frameworks may replace a competing original library on one bullet. Keep the real product. Never laundry-list 4+ tools in one sentence. Unrelated older roles keep their original stack and must not repeat baseline languages on every line.
7. Delete laundry-list bullets of the form "Did X using A, B, C, and D to support Y". Rewrite as a project sentence with at most one tool.
8. Delete JD-only tools from older unrelated roles. Never delete the single latest-company mention of a required distinctive skill.
9. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
10. Every role must have at least 5 bullets. Typical 5-8 for recent or longer roles, 5-6 for earlier roles. Most of those bullets describe work with no tool name.
11. Skills: ALWAYS return {"hard":[...],"soft":[...]}. Hard MUST lead with the JD's must-have technologies, then other true supporting skills. Soft: 3-5 true interpersonal skills. Plain strings only — no <b>, <br>, or HTML.
12. Summary: a professional profile. Name the primary JD stack once. Not a recap of jobs. No version numbers, no hiring-company name.
13. Keep <b>...</b> around remaining tech tokens. Skills must be plain text. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned"/"best practices"/"foster".
14. Coverage: in the latest company, each distinctive required skill (the frameworks and languages the JD actually hinges on) appears exactly once across that role's bullets. Baseline skills that everyone lists (the common scripting language, markup, stylesheets, git) appear at most once in that company, and usually belong only in the skills section. Industry/domain words stay in summary/skills. Optional: other same-lane companies, still once per company.
15. Human-voice fail: if most bullets in a role contain the same two language names, rewrite those bullets to drop the repeated names and talk about the product.

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
  "skills": { "hard": ["..."], "soft": ["..."] }
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
Create a tailored resume a human recruiter would believe. Real companies, dates, and projects. Required JD skills show up in skills, summary, and once in the latest company — not stuffed into every bullet.

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

PROJECT AND STACK MAP:
${timeline || 'Keep original projects per company. Place each JD must-have technology in skills, the summary, and the latest company. Other same-lane companies are optional. Do not clone the JD stack into every employer.'}

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for seniority, must-have technologies, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — real projects, tailored emphasis:
   - Read the original description as a source of projects: products, features, systems, integrations, migrations, and the candidate's part in them.
   - Each bullet is one project or one distinct technical contribution: who owned it, what shipped, and what changed for users or the system.
   - JD KEYWORD PLACEMENT:
     REQUIRED — latest company: each distinctive required skill (the frameworks and languages the JD actually hinges on) MUST appear by name somewhere in that company, even if the original title or stack differed. Keep real products (storefront, search, portal). Put each of those skills on a different bullet, once. Do not pile them into one sentence.
     OPTIONAL — other similar web/app companies may name a distinctive JD skill once.
     Do NOT put required tools on every employer. Do NOT force industry/domain terms into a company in a different industry.
   - ONCE PER COMPANY: after a tool is named in a role, do not name it again in that role. Baseline skills (common scripting language, markup, stylesheets, git) belong in the skills section; if used in experience, at most once for the whole company, never on every line.
   - HUMAN VOICE: lead with what shipped and who it helped. Most bullets have zero tool names. A good bullet: "Shipped product search so shoppers could filter inventory without leaving the page." A bad bullet: "Developed features using Skill, Skill, Skill, Skill, and Skill."
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
   - This is the primary ATS list. A required JD skill belongs here even if it is only placed in one experience role.
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
   - Do not change a frontend or otherwise narrower role into an unrelated backend or JD title.
   - Keep company names and start/end dates exactly.

7. BOLD TECH IN EXPERIENCE AND SUMMARY:
   - Wrap technical skills/tools/frameworks/languages with <b>...</b> inside experience description strings and the summary
   - Only wrap the token. Keep tags inside JSON strings
   - Do not wrap skills.hard or skills.soft — those are plain labels with no HTML

Respond with ONLY valid JSON. Same number of positions as original experience.

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Frontend-focused engineer who builds production web applications with modern UI frameworks and strong component architecture. Comfortable owning delivery from prototype through production.",
  "experience": [
    {
      "position": "Job title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Shipped catalog updates on <b>Skill</b> so merchandisers could change products without a deploy.",
        "Rebuilt storefront search in <b>Skill</b> so shoppers could filter without leaving the page.",
        "Built a support chatbot so shoppers got answers without waiting on email.",
        "Wired analytics on checkout so the team could see where carts dropped.",
        "Kept the hybrid app in step with the same catalog so mobile shoppers saw current inventory."
      ]
    }
  ],
  "skills": {
    "hard": ["core technical skill 1", "core technical skill 2"],
    "soft": ["Leadership", "Communication", "Problem-solving"]
  }
}
`;
};
