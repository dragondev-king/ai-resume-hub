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

CHRONOLOGY IS CRITICAL — this is how recruiters detect AI or lies:
- Never put a technology, library, framework version, language version, cloud product, or API in a job that ended before that thing existed.
- Example: if Angular 21 was released in November 2025, a role that ended in 2024 (or any month before Nov 2025) MUST NOT mention Angular 21. Use the Angular version (or predecessor) that actually existed during that job.
- Versioned names from the job description (Angular 21, React 19, Java 21, Python 3.13, Next.js 15, Node.js 22, .NET 8, etc.) are not the same as the family name. The family (Angular, React) may appear in older jobs if it existed then; the specific new version may appear only in roles whose dates overlap after that version's release. If a role started before a release and is still current, you may mention the new version, but never imply it was used from the start of that job.
- If you are unsure when something was released, be conservative: use the exact new version only in the current or most recent role. Older roles get era-appropriate predecessors or the unversioned family name.
- Newest job-description tech belongs mainly in the most recent 1–2 roles. Older roles should show a believable progression (older stack → newer stack), not a copy-paste of today's JD.
- Never claim years of experience with a technology that exceed how long it has existed. Do not write "5 years of Angular 21" if Angular 21 is months old.
- Generate 7–12 bullet points per role, varying by duration and seniority. Extract job title and company from the job description.`;

const TIMELINE_SYSTEM_PROMPT = `You map job-description technologies onto a candidate's real work history with strict chronological honesty. Recruiters will reject resumes that mention a tool in a job before that tool existed. When unsure of a release date, be conservative. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a senior recruiter and technical editor. Your only job is to make a tailored resume chronologically honest and human. Fix anachronisms. Do not weaken tailoring except where a date makes a claim impossible. Respond with valid JSON only.`;

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
          mustNotUse: {
            type: 'array',
            items: { type: 'string' },
          },
          eraStackGuidance: { type: 'string' },
        },
        required: ['company', 'start_date', 'end_date', 'mayUse', 'mustNotUse', 'eraStackGuidance'],
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

Build a chronology map so resume bullets cannot mention tools before they existed.

INSTRUCTIONS:
1. Extract technologies, frameworks, languages, platforms, and versioned products from the job description.
2. For each, estimate when it first became available (YYYY-MM). Use your knowledge. If unsure, set confidence to "low" and treat it as too new for historical roles.
3. Distinguish family names from versions. "Angular" (2016+) is not "Angular 21". "React" is not "React 19".
4. For each work-history role, list:
   - mayUse: JD technologies that actually existed during that role (family names allowed if the family existed; specific new versions only if the version existed before the role ended)
   - mustNotUse: JD technologies that did not exist yet, or whose version is newer than the role's end date
   - eraStackGuidance: what stack a credible engineer would have used in that period (predecessors, older versions)
5. A role ending before a release date must NOT include that release. "Present" roles may include current JD tech.
6. If a version's release date is uncertain, put it only in the current/most recent role.

Respond with ONLY JSON:
{
  "technologies": [
    {
      "name": "Angular 21",
      "kind": "versioned",
      "introduced": "2025-11",
      "confidence": "high",
      "notes": "Specific Angular major. Not valid in jobs that ended before 2025-11."
    }
  ],
  "roles": [
    {
      "company": "Acme",
      "start_date": "2022-01",
      "end_date": "2024-06",
      "mayUse": ["Angular", "TypeScript", "RxJS"],
      "mustNotUse": ["Angular 21"],
      "eraStackGuidance": "Angular 12–16 era. Do not mention Angular 21."
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
${params.timeline || 'No separate timeline was produced. Use release-date knowledge and conservative rules: specific new versions from the JD only in the current/most recent role; older roles use predecessors.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT AND REWRITE:
1. Keep the same companies, dates, number of roles, and JSON shape.
2. In each role, remove or replace any technology/version that did not exist before that role's end date.
3. Keep tailoring: older roles should still look relevant, using era-correct equivalents (e.g. earlier Angular majors instead of Angular 21).
4. Summary must not claim years of experience with a tool that exceed how long that tool has existed.
5. Skills may include current JD technologies the candidate could reasonably know by today or from a current/most recent role. Do not imply they used a brand-new version across their whole career.
6. Keep <b>...</b> around tech tokens. Sound human. No "scalability"/"reliability"/"robust".
7. If a bullet is anachronistic, rewrite it — do not just delete until the role is empty. Aim for 7–12 bullets per role.

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
${timeline || 'Estimate release dates yourself. When unsure, put brand-new JD versions only in the current/most recent role.'}

CRITICAL TAILORING INSTRUCTIONS:
1. ANALYZE the job description for title, company, required skills, responsibilities, and terminology.

2. TRANSFORM each role toward the target job, but only with tech that existed during that role:
   - Adjust titles to show progression toward the target position.
   - Rewrite bullets around relevant work, transferable skills, and measurable results.
   - Do NOT spray the job description's newest stack across every past job.
   - Don't use complex words like "scalability", "reliability", or "robust". Write like a native English speaker.

3. CHRONOLOGY / VERSION RULES:
   - A tool may appear in a role only if it existed before that role ended.
   - Specific versions from the JD (e.g. Angular 21) belong only in roles active after that version shipped. If a current role started before the release, mention the new version as recent work, not as something used for the whole tenure.
   - Older roles: use the version or predecessor that was current then (Angular 12, Angular 14, AngularJS, etc.), or the unversioned family name if that family existed.
   - Show believable stack evolution over time. Recent roles can look closest to the JD.
   - Never claim more years with a technology than that technology has existed.
   - Keep every original company name and the original start/end dates (YYYY-MM). Same number of positions as the original history.

4. JOB TITLE STRATEGY:
   - Most recent position: closely match or sit one step below the target title.
   - Earlier positions: clear progression. Keep company names exact.

5. SKILLS LIST:
   - Include current skills plus JD skills the candidate could reasonably know by today or from their most recent/current role.
   - Listing a current JD technology in Skills is OK if a recent/current role could include it. Do not also back-date it into old bullets.

6. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - Wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b>
   - Examples: <b>React</b>, <b>Node.js</b>, <b>PostgreSQL</b>, <b>AWS</b>, <b>Docker</b>, <b>CI/CD</b>, <b>TypeScript</b>
   - Only wrap the token — not entire sentences. Do not bold soft skills.
   - Keep the <b> tags inside JSON string values.

EXAMPLE OF HONEST TAILORING:
Applying for an Angular 21 role. History includes a 2022–2024 frontend job and a current 2025–Present job.
- 2022–2024: <b>Angular</b> 14/15, <b>TypeScript</b>, <b>RxJS</b>. Do not mention Angular 21.
- Current role (after Angular 21's release): <b>Angular 21</b>, <b>TypeScript</b>, and related current tools.
- Skills may include Angular 21.
- Summary must not say they have used Angular 21 for many years.

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
