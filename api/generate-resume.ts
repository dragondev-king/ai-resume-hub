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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are an expert resume writer. Write human, credible resumes that a recruiter would believe were written by the candidate.

QUALITY RULES (non-negotiable):
- Sound like a native English speaker. Short, concrete sentences. No filler words like "scalability", "reliability", or "robust".
- Keep company names and employment dates exactly as provided. Do not invent extra jobs.
- Aggressively tailor titles and bullets to the target role, but stay chronologically honest.
- In experience bullets, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>).

CHRONOLOGY IS CRITICAL — honesty and job-fit both matter:
- Never put a technology or specific version in a job that ended before that thing existed.
- Example: Angular 21 (Nov 2025) must not appear in a role that ended in 2024. Use the Angular version that existed then.
- The opposite is also required: if the job description asks for a version, and a role was still active after that version shipped, that role MUST use the required version by name. Do not "play it safe" by writing only older versions in eligible jobs.
- Example: React 19 (Dec 2024). A role from Oct 2024–Nov 2025 or Oct 2025–Apr 2026 MUST mention <b>React 19</b>. A role that ended in 2022 must not.
- Family names (React, Angular) can appear in older jobs if the family existed then. Specific new versions belong only in roles whose dates overlap after the release.
- If a role started before a release and continued after it, mention the new version as work during that job — not as something used from day one.
- If you are unsure of a release date, still put required JD versions in the most recent roles that could plausibly include them. Only omit a required version from a role when that role clearly ended before the version existed.
- Older ineligible roles should show a believable progression (React 16 → 17/18 → 19), not a copy of today's JD.
- Never claim years of experience with a version that exceed how long that version has existed. "8 years of React 19" is false; recent React 19 work plus earlier React is fine.
- Generate 7–12 bullet points per role, varying by duration and seniority. Extract job title and company from the job description.`;

const TIMELINE_SYSTEM_PROMPT = `You map job-description technologies onto a candidate's real work history. A version must not appear in a job that ended before it existed. A version the job requires MUST be marked mustUse for every role that was still active after it shipped. Do not omit required JD versions from eligible roles. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a senior recruiter and technical editor. Make the resume chronologically honest AND tailored. Remove versions from jobs that ended before they existed. If a required job-description version is missing from an eligible role, skills, or a recent-work summary line, add it. Do not replace required versions with older ones in eligible jobs. Respond with valid JSON only.`;

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

    if (provider !== 'openai' && provider !== 'claude') {
      return res.status(400).json({ error: 'Invalid provider. Must be "openai" or "claude".' });
    }

    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable.',
      });
    }

    if (provider === 'claude' && !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'Anthropic API key is not configured. Please set ANTHROPIC_API_KEY environment variable.',
      });
    }

    const today = formatToday();
    const workHistory = formatWorkHistory(profile);

    const timeline = await analyzeTechnologyTimeline({
      provider,
      jobDescription,
      workHistory,
      today,
    });

    const draft = await generateResumeDraft({
      provider,
      prompt: createAIPrompt(profile, jobDescription, timeline, today, workHistory),
    });

    const aiResponse = await auditResumeChronology({
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
    return res.status(500).json({
      error: 'Failed to generate resume',
      details: error.message,
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

Build a chronology map. Required job-description versions must appear in eligible roles and must not appear in ineligible roles.

INSTRUCTIONS:
1. Extract technologies, frameworks, languages, platforms, and versioned products from the job description. Mark which ones the job requires (especially specific versions like React 19 or Angular 21).
2. For each, estimate when it first became available (YYYY-MM). Use your knowledge.
3. Distinguish family names from versions. "React" is not "React 19".
4. For each work-history role, list:
   - mayUse: JD technologies that existed during that role
   - mustUse: required JD versions/tools that existed before the role ended (role end date >= introduced date, or end is Present). These MUST appear in that role's resume bullets.
   - mustNotUse: JD technologies that did not exist yet, or whose version is newer than the role's end date
   - eraStackGuidance: what stack to write for that period, including which required JD versions to name
5. A role ending before a release date must NOT include that release.
6. If a required version's date is uncertain, still put it in mustUse for the most recent roles. Only put it in mustNotUse when the role clearly ended too early.
7. Do not leave mustUse empty for recent roles when the JD requires a current version those dates allow.

Respond with ONLY JSON:
{
  "technologies": [
    {
      "name": "React 19",
      "kind": "versioned",
      "introduced": "2024-12",
      "confidence": "high",
      "notes": "Required by the JD. Valid in any role still active after 2024-12."
    }
  ],
  "roles": [
    {
      "company": "Subflow",
      "start_date": "2024-10",
      "end_date": "2025-11",
      "mayUse": ["React", "React 19", "TypeScript"],
      "mustUse": ["React 19"],
      "mustNotUse": [],
      "eraStackGuidance": "Role continued after React 19 shipped. Bullets MUST name React 19."
    },
    {
      "company": "Phynd Health",
      "start_date": "2021-05",
      "end_date": "2022-11",
      "mayUse": ["React", "TypeScript"],
      "mustUse": [],
      "mustNotUse": ["React 19"],
      "eraStackGuidance": "React 16/17 era. Do not mention React 19."
    }
  ]
}`;

  try {
    if (params.provider === 'claude') {
      return await generateWithClaude({
        prompt,
        system: TIMELINE_SYSTEM_PROMPT,
        schema: TIMELINE_OUTPUT_SCHEMA,
        maxTokens: 4000,
      });
    }

    return await generateWithOpenAI({
      prompt,
      system: TIMELINE_SYSTEM_PROMPT,
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
  if (params.provider === 'claude') {
    return generateWithClaude({
      prompt: params.prompt,
      system: SYSTEM_PROMPT,
      schema: RESUME_OUTPUT_SCHEMA,
      maxTokens: 8000,
    });
  }

  return generateWithOpenAI({
    prompt: params.prompt,
    system: SYSTEM_PROMPT,
    temperature: 0.55,
    maxTokens: 8000,
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
${params.timeline || 'Use release-date knowledge. Required JD versions MUST appear in every role still active after that version shipped. Remove them only from roles that ended before they existed.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT AND REWRITE:
1. Keep the same companies, dates, number of roles, and JSON shape.
2. Remove or replace any technology/version in a role that ended before that thing existed.
3. If the job description requires a specific version (e.g. React 19) and a role was still active after it shipped, that version MUST appear in that role's bullets. If the draft only says "React 17/18" in a 2025 job, change it to React 19.
4. Put required JD versions in the skills list when at least one role is eligible.
5. Summary should mention required current versions as recent experience, without claiming more years than the version has existed.
6. Older ineligible roles stay on era-correct predecessors. Keep tailoring.
7. Keep <b>...</b> around tech tokens. Sound human. No "scalability"/"reliability"/"robust".
8. Aim for 7–12 bullets per role. Rewrite anachronistic bullets; do not empty a role.

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
    if (params.provider === 'claude') {
      return await generateWithClaude({
        prompt,
        system: AUDIT_SYSTEM_PROMPT,
        schema: RESUME_OUTPUT_SCHEMA,
        maxTokens: 8000,
      });
    }

    return await generateWithOpenAI({
      prompt,
      system: AUDIT_SYSTEM_PROMPT,
      temperature: 0.2,
      maxTokens: 8000,
    });
  } catch (error) {
    console.error('Chronology audit failed; returning draft resume:', error);
    return params.draft;
  }
}

async function generateWithOpenAI(params: {
  prompt: string;
  system: string;
  temperature: number;
  maxTokens: number;
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: params.system },
      { role: 'user', content: params.prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: params.temperature,
    max_tokens: params.maxTokens,
  });

  return completion.choices[0]?.message?.content || '';
}

async function generateWithClaude(params: {
  prompt: string;
  system: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<string> {
  const message = await anthropic.messages.create({
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

function extractClaudeTextContent(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
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
Create a highly tailored, chronologically honest resume. Position the candidate as a strong fit without making claims a recruiter could catch as AI or a lie.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates and companies are FACTS):
${workHistory}

EDUCATION:
${education
  .map(
    (edu: any) =>
      `- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})`
  )
  .join('\n')}

CURRENT SKILLS:
${skills.filter((skill: string) => skill.trim()).join(', ')}

TECHNOLOGY TIMELINE FOR THIS CANDIDATE (follow strictly):
${timeline || 'Estimate release dates yourself. Required JD versions MUST appear in every role still active after they shipped. Omit them only from roles that ended first.'}

CRITICAL TAILORING INSTRUCTIONS:
1. ANALYZE the job description for title, company, required skills, responsibilities, and terminology.

2. TRANSFORM each role toward the target job, but only with tech that existed during that role:
   - Adjust titles to show progression toward the target position.
   - Rewrite bullets around relevant work, transferable skills, and measurable results.
   - Do NOT spray a brand-new version across jobs that ended before it existed.
   - DO use required JD versions by name in every eligible role. Missing React 19 in a 2025 React job is a failed resume.
   - Don't use complex words like "scalability", "reliability", or "robust". Write like a native English speaker.

3. CHRONOLOGY / VERSION RULES:
   - A tool may appear in a role only if it existed before that role ended.
   - Required JD versions MUST appear in every role whose end date is on or after the version's release (or Present).
   - If a role started before the release and continued after it, name the required version in that role.
   - Ineligible older roles: use the version that was current then, or the family name.
   - Show believable stack evolution over time (older majors → required current major in recent jobs).
   - Never claim more years with a version than that version has existed.
   - Keep every original company name and the original start/end dates (YYYY-MM). Same number of positions as the original history.

4. JOB TITLE STRATEGY:
   - Most recent position: closely match or sit one step below the target title.
   - Earlier positions: clear progression. Keep company names exact.

5. SKILLS LIST:
   - Include required JD versions (e.g. React 19) when any role is eligible.
   - Do not back-date those versions into old bullets.

6. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - Wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b>
   - Examples: <b>React 19</b>, <b>React</b>, <b>Node.js</b>, <b>PostgreSQL</b>, <b>TypeScript</b>
   - Only wrap the token — not entire sentences. Do not bold soft skills.
   - Keep the <b> tags inside JSON string values.

EXAMPLE OF HONEST TAILORING:
Job requires React 19 (released Dec 2024).
- 2021–2022: <b>React</b> 16/17. Do not mention React 19.
- Oct 2024–Nov 2025: bullets MUST name <b>React 19</b>.
- Oct 2025–Apr 2026: bullets MUST name <b>React 19</b>.
- Skills MUST include React 19.
- Summary: recent React 19 experience is good. "8 years of React 19" is not.

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
        "Built APIs with <b>Node.js</b> and <b>TypeScript</b> on <b>AWS</b>...",
        "Led frontend delivery using <b>React</b>...",
        "Optimized <b>PostgreSQL</b> queries and cut report time by 30%..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
