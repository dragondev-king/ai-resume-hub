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
- In experience bullets, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>Skill</b>).

CHRONOLOGY IS CRITICAL — honesty and job-fit both matter:
- Never put a technology or specific version in a job that ended before that thing existed.
- Treat "<Family>" and "<Family> <Version>" as different. Extract both from the job description; do not assume a fixed stack.
- Specific versions required by the job description may appear in the most recent company only, and only if that role was still active after the version shipped.
- Within that company, each specific version is named ONCE in the whole bullet list. Later bullets use the family name only.
- All earlier companies use the family name only — no version numbers.
- The professional summary must never name a specific version — family names only.
- If the most recent role ended before the required version existed, omit that version from experience bullets entirely. Do not backfill it into an older company.
- Never claim years of experience with a version. Generate 7–12 bullet points per role. Extract job title and company from the job description.`;

const TIMELINE_SYSTEM_PROMPT = `You map job-description technologies onto a candidate's real work history. A specific version must not appear in a job that ended before it existed. Required JD versions belong in mustUse for the MOST RECENT role only. Each version should be named once in that role's bullets, then family names only. All earlier roles: family name in mayUse, required version in mustNotUse. Respond with valid JSON only.`;

const AUDIT_SYSTEM_PROMPT = `You are a senior recruiter and technical editor. Make the resume chronologically honest and human. The professional summary must not name specific versions. In experience, a required version from the job description may appear only in the most recent company, and only once in that company's bullets — later bullets use the family name. Strip repeated versions from the same job and from earlier companies. Remove versions from jobs that ended before they existed. Use technologies from the job description, not a fixed example stack. Respond with valid JSON only.`;

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
${params.timeline || 'Required JD versions may be named in the most recent company only, and only if that role was still active after the version shipped. Summary: family names only, no versions. Earlier jobs: family names, no version numbers.'}

DRAFT RESUME JSON:
${params.draft}

AUDIT AND REWRITE:
1. Keep the same companies, dates, number of roles, and JSON shape.
2. Professional summary: remove every specific version ("<Family> <Version>" → "<Family>"). Do not add versions to the summary.
3. Experience: a required version from THIS job description may appear only in the most recent company, and only if that job was still active after the version shipped. Name each version ONCE in that company's bullets. If the same version appears in three bullets, keep it in one bullet and change the others to the family name.
4. Strip specific versions from every earlier company. Use the family name with no version number.
5. Skills may list the required version for ATS. Summary still must not.
6. Keep <b>...</b> around tech tokens. Sound human. No "scalability"/"reliability"/"robust".
7. Aim for 7–12 bullets per role.

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
${timeline || 'Required JD versions: name them only in the most recent company if that role was still active after the version shipped. Summary: no version numbers. Earlier jobs: family name only.'}

CRITICAL TAILORING INSTRUCTIONS:
1. ANALYZE the job description for title, company, required skills, responsibilities, and terminology.

2. TRANSFORM each role toward the target job, but only with tech that existed during that role:
   - Adjust titles to show progression toward the target position.
   - Rewrite bullets around relevant work, transferable skills, and measurable results.
   - Don't use complex words like "scalability", "reliability", or "robust". Write like a native English speaker.

3. CHRONOLOGY / VERSION RULES:
   - Pull required technologies and versions from THIS job description. Do not invent a default stack.
   - Professional summary: family names only. Never write "<Family> <Version>" in the summary.
   - Experience: name a required JD version in the most recent company only, and only if that role was still active after the version shipped.
   - Each specific version appears at most ONCE in that company's entire bullet list. Later bullets use the family name only.
   - Do not repeat that version in any earlier company, even if those dates would have allowed it.
   - Earlier companies: family name only, no version number.
   - If the most recent role ended before the version existed, do not put the version on an older job either.
   - Keep every original company name and the original start/end dates (YYYY-MM). Same number of positions as the original history.

4. JOB TITLE STRATEGY:
   - Most recent position: closely match or sit one step below the target title.
   - Earlier positions: clear progression. Keep company names exact.

5. SKILLS LIST:
   - May include required versions from the job description for keyword match.
   - That still does not belong in the summary or in earlier experience bullets.

6. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - Wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b>
   - Latest job: one <b>Family Version</b> mention per required version; other bullets use <b>Family</b>
   - Only wrap the token — not entire sentences. Do not bold soft skills.
   - Keep the <b> tags inside JSON string values.

EXAMPLE OF HONEST TAILORING:
Job requires <Family> <Version>. Most recent job is eligible.
- Summary: family names only (no version numbers).
- Last company, one bullet: mention <b>Family Version</b> once.
- Same company, remaining bullets: <b>Family</b> only.
- Every earlier company: family names only. No version numbers.
- Skills may include Family Version.

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
        "Built APIs with <b>Skill</b>...",
        "Led delivery using <b>Skill</b>...",
        "Improved <b>Skill</b> workflows and cut report time by 30%..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
