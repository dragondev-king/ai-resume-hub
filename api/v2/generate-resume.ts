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
  'You are an expert resume writer. Tailor the resume for THIS job. Required technical skills from the JD (languages, frameworks, CSS, source control) MUST appear by name in skills.hard, in the summary, AND in the LATEST company\'s experience bullets — even if that job\'s original title or stack was different (for example a frontend title when the JD requires a backend framework). Keep the latest company\'s real products/projects; name the JD tools on those projects. Optional: same tools in other appropriate companies. Do not clone the JD stack into every employer. Do not skip the latest company because of "lane" or competing original tools. Industry/domain terms belong in summary and skills, not forced into an unrelated employer. The summary is a professional profile. At least 5 bullets per company. Wrap tech in experience and summary with <b>...</b>. Never wrap skill names with HTML. Extract jobTitle and companyName from the JD for metadata only.';

const TIMELINE_SYSTEM_PROMPT = `You map projects and technologies. For the latest role, mustUse is EVERY required JD technical skill (languages, frameworks, CSS, git), even if the original description used something else. Other same-lane roles may include them in mayUse. Unrelated roles mustNotUse JD-only tools. Do not skip the latest role. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a tailoring editor. Before you finish, read the latest company's bullets. Every required JD technical skill MUST appear there by exact family name. If any is missing, add or rewrite bullets in that company until they all appear. Do not omit them because the original title was frontend or the original stack used a competing library. Optional in other same-lane companies. Do not copy into every employer. Skills.hard leads with JD must-haves. Summary names the primary JD stack. No hiring-company leakage. No fake metrics. Respond with valid JSON only.`;

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
      "eraStackGuidance": "Latest role: keep real products, but bullets MUST name every required JD technical skill. Other same-lane roles may. Unrelated roles must not.",
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
4. The latest company's bullets MUST name every required JD technical skill. Do not strip those names. Other companies: keep original tools plus optional same-lane JD tools.
5. If two or more roles use the same 3+ technology list in a bullet, rewrite those bullets around different projects.
6. In the latest company, required JD tools override competing original libraries for at least some bullets (keep the real product; change the named stack to match the JD). Do not laundry-list every tool in one bullet. Unrelated older roles keep their original stack.
7. Delete laundry-list bullets of the form "Did X using A, B, C, and D to support Y".
8. Delete JD-only tools from older unrelated roles. Never delete them from the latest company.
9. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
10. Every role must have at least 5 bullets. Typical 5-8 for recent or longer roles, 5-6 for earlier roles. If a role has fewer than 5, split real projects into distinct contributions. Do not drop below 5. Do not pad with generic duties.
11. Skills: ALWAYS return {"hard":[...],"soft":[...]}. Hard MUST lead with the JD's must-have technologies, then other true supporting skills. Soft: 3-5 true interpersonal skills. Plain strings only — no <b>, <br>, or HTML.
12. Summary: a professional profile of who they are for THIS role. It MUST name the primary JD technology family as a strength. Not a recap of jobs. If it lists delivered/migrated/enhanced projects, rewrite it. No version numbers, no hiring-company name.
13. Keep <b>...</b> around tech tokens in experience bullets and the summary. Skills must be plain text with no markup. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned"/"best practices"/"foster".
14. HARD FAIL if missing: concatenate the latest company's description bullets. Every required JD technical skill (from the Required Skills list: languages, frameworks, CSS, git) must appear there as a named token. If any is missing, rewrite or add bullets in THAT company until all are present. Do not "save" the omission because the role was frontend-only or used a competing stack. Industry/domain words belong in summary/skills, not forced into an unrelated employer. Optional: other same-lane companies. Do not add required tools to every company.

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
Create a tailored resume for THIS job. Keep real companies, dates, and projects. Enhance wording and place required JD technologies where a recruiter and ATS will see them — skills, summary, the latest company, and optionally other appropriate companies. Do not reprint the original CV unchanged, and do not rewrite every employer into the same stack.

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
     REQUIRED — latest company: every required technical skill from the JD (languages, frameworks, CSS, git) MUST appear by name in that company's bullets. This is mandatory even if the original job title is frontend and the JD wants backend, or the original used a competing library. Keep the company's real products (storefront, search, portal, APIs); attach the JD tool names to those projects. Spread them across several bullets (one or two tools per bullet). Before finishing, scan the latest company's bullets and add any missing required skill.
     OPTIONAL — other companies whose work is a similar web/app product may also name those tools.
     Do NOT put required tools on every employer. Do NOT force industry/domain terms into a company in a different industry (those stay in summary and skills).
   - If the original already names a JD tool, keep it and still ensure the latest company names it.
   - Lead each role with the work that best matches THIS job when that work is already in the original description.
   - Make ownership obvious. Use the strongest verb the original supports. Do not inflate "contributed" into "led."
   - Outcomes: use numbers only if they are in the original. Otherwise state a concrete qualitative result. Do not invent 20%/25%/40%.
   - Name at most one or two tools per bullet. Different companies must read like different jobs.
   - FORBIDDEN: generic duties (collaborated with teams, participated in agile, wrote documentation, performed testing, translated requirements) unless tied to a named deliverable. FORBIDDEN: "Did X using A, B, C, and D to support Y."
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
        "Owned the search work — shipped filters with <b>Skill</b> so users could find records without leaving the page.",
        "Built a status API so operations could see failed requests the same day.",
        "Integrated the new screens with existing services so the proof of concept could run without a rewrite.",
        "Hardened state handling on the unfinished app so data survived navigation and refresh.",
        "Closed production defects on the same product so the release stayed on schedule."
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
