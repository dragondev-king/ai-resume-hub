import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

type AIProvider = 'openai' | 'claude';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Long pasted JDs (e.g. LinkedIn/export dumps) blow the output budget; keep the useful front portion. */
const MAX_JOB_DESCRIPTION_CHARS = 12000;
const MAX_OUTPUT_TOKENS = 12000;

const SYSTEM_PROMPT_BASE =
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Your goal is to transform a candidate\'s experience to make them appear as an ideal fit for the target position, even if their original experience doesn\'t perfectly match. Be creative and strategic in highlighting transferable skills, relevant technologies, and adaptable experience. Generate 6-10 bullet points per work experience, with varying counts based on role complexity and duration. Extract the job title and company name from the job description. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>). Always return complete valid JSON with a non-empty experience array matching the original number of positions.';

const SYSTEM_PROMPT_KEEP_COMPANIES =
  `${SYSTEM_PROMPT_BASE} CRITICAL: Tailor only experience bullet points (and summary/skills). Keep every original company name and job title/position exactly as provided — do not rename employers or roles.`;

const SYSTEM_PROMPT_TAILOR_COMPANIES =
  `${SYSTEM_PROMPT_BASE} CRITICAL: Also tailor company names and role/job titles. Research the target employer from the job description (industry, business type, approximate size). Replace the candidate's two most recent employers with REAL mid-sized, lesser-known companies in that same industry (roughly 50–500 employees, niche/regional — NOT famous giants). Prefer a lesser-known mid-market rival for the most recent employer. Never list the target company itself as a past employer. Never use FAANG, Fortune 500 household names, Big Tech, mega-insurers, or other globally famous brands. Update addresses to match the replacement companies when known.`;

const CLAUDE_MODEL = 'claude-sonnet-4-6';

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

interface RequestBody {
  profile: any;
  jobDescription: string;
  provider?: AIProvider;
  tailorCompanyNames?: boolean;
}

function truncateJobDescription(jobDescription: string): string {
  const trimmed = jobDescription.trim();
  if (trimmed.length <= MAX_JOB_DESCRIPTION_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_JOB_DESCRIPTION_CHARS)}\n\n[Job description truncated for length; use the content above as the source of truth.]`;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      profile,
      jobDescription,
      provider = 'openai',
      tailorCompanyNames = false,
    } = req.body as RequestBody;

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

    const prompt = createAIPrompt(
      profile,
      truncateJobDescription(jobDescription),
      Boolean(tailorCompanyNames)
    );
    const systemPrompt = Boolean(tailorCompanyNames)
      ? SYSTEM_PROMPT_TAILOR_COMPANIES
      : SYSTEM_PROMPT_KEEP_COMPANIES;
    const aiResponse =
      provider === 'claude'
        ? await generateWithClaude(prompt, systemPrompt)
        : await generateWithOpenAI(prompt, systemPrompt);

    if (!aiResponse?.trim()) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details: 'The AI returned an empty response. Please try again.',
      });
    }

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

async function generateWithOpenAI(prompt: string, systemPrompt: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: MAX_OUTPUT_TOKENS,
  });

  const content = completion.choices[0]?.message?.content || '';
  if (completion.choices[0]?.finish_reason === 'length') {
    console.warn('OpenAI resume response truncated due to max_tokens');
  }
  return content;
}

async function generateWithClaude(prompt: string, systemPrompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: RESUME_OUTPUT_SCHEMA,
      },
    },
  });

  if (message.stop_reason === 'max_tokens') {
    console.warn('Claude resume response truncated due to max_tokens');
  }

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
  tailorCompanyNames: boolean
): string => {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];

  const companyAndRoleInstructions = tailorCompanyNames
    ? `
4. COMPANY NAME & ROLE RESEARCH (REQUIRED — tailorCompanyNames is ON):
   - Identify the target company the candidate is applying to from the job description
   - Infer what kind of business it is: industry, products/services, business model, and approximate company size
   - Replace the candidate's TWO MOST RECENT employers (usually the first two entries when experience is newest-first) with REAL mid-sized, lesser-known companies in the SAME industry
   - SIZE & FAME RULES (STRICT):
     - Prefer roughly 50–500 employees (or similar mid-market scale to the target if known)
     - Prefer obscure / niche / regional firms that recruiters would not instantly recognize as household brands
     - DO NOT use famous giants or well-known brands, including but not limited to: FAANG/Big Tech, Fortune 500 household names, mega insurers/payers, mega EHR vendors (e.g. Epic, Oracle Health/Cerner, Optum, UnitedHealth, Anthem/Elevance, Cigna, CVS/Aetna), and other globally famous companies
     - DO NOT invent fake-sounding names; use real companies that fit the mid-market / lesser-known criteria
   - MOST RECENT employer: prefer a lesser-known mid-market rival/competitor of the target company when a credible one exists
   - SECOND MOST RECENT employer: another mid-sized lesser-known company in the same industry (not the target, and not the same as the first substitute)
   - NEVER use the target company itself as a past employer
   - Keep all earlier employers (beyond the two most recent) EXACTLY as provided
   - Update "address" for replaced companies to a plausible real HQ or major office for that company when known
   - Also tailor "position" / role titles:
     - Most recent: closely match or sit one step below the target job title
     - Earlier roles: show clear progression toward the target role
     - Use industry-standard titles aligned with the target position
   - Keep start_date / end_date and the number of experience entries identical to the original
`
    : `
4. COMPANY NAMES & ROLE TITLES (REQUIRED — tailorCompanyNames is OFF):
   - Keep EVERY company name EXACTLY as provided in ORIGINAL EXPERIENCE
   - Keep EVERY position / job title EXACTLY as provided in ORIGINAL EXPERIENCE
   - Keep addresses and dates as provided
   - Only rewrite bullet point descriptions (and summary/skills) — do not rename employers or roles
`;

  return `
Please create a highly tailored resume for the following job description. The goal is to position the candidate as an ideal fit for this specific role, even if their original experience doesn't perfectly match.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

ORIGINAL EXPERIENCE (Use as inspiration but don't be limited by it):
${experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || ''}
  Original Description: ${exp.description || ''}
`).join('\n')}

EDUCATION:
${education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${skills.filter((skill: string) => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description thoroughly to identify:
   - Job title and company name
   - Required technical skills and technologies
   - Key responsibilities and duties
   - Industry-specific terminology
   - Desired qualifications and experience level
   - Company culture and values mentioned
   ${tailorCompanyNames ? '- Target company industry, business type, and approximate size (needed for employer substitution)' : ''}

2. TRANSFORM each work experience to align with the target role:
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include specific technologies, tools, and methodologies mentioned in the job description
   - Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write
   - Focus on transferable skills that apply to the target role
   - Use industry-specific language and terminology from the job description
   - Write 6-10 bullet points per position (complete all bullets — never leave descriptions empty)

3. CREATIVE TAILORING APPROACH:
   - If the job requires specific technologies (e.g., Ruby on Rails), incorporate those technologies into relevant work experiences
   - Emphasize similar frameworks, methodologies, or problem-solving approaches
   - Avoid examples that are too close to the job's tech stack because it'll be obvious AI generated it.
   - Highlight leadership, project management, and collaboration skills that are universally valuable
   - Show how past experiences demonstrate the ability to learn and adapt to new technologies
   - Create bullet points that showcase the candidate's potential to excel in the target role
${companyAndRoleInstructions}
Please provide the following in JSON format:

1. Extract the job title and company name from the job description
2. A compelling professional summary that positions the candidate for this specific role
3. Enhanced work experience with 6-10 complete bullet points per position that:
   - Are specifically tailored to the job description requirements
   - Include relevant technologies, tools, and methodologies from the job description
   - Show quantifiable achievements and measurable impact
   - Demonstrate transferable skills and adaptability
   - Use action verbs and industry-specific terminology from the job description
   - Vary bullet point count based on role complexity and duration
4. Enhanced skills list that includes both current skills and skills mentioned in the job description

5. BOLD TECH SKILLS IN BULLET POINTS (REQUIRED):
   - In every experience bullet point, wrap technical skills, tools, frameworks, languages, platforms, and methodologies with <b>...</b> tags
   - Examples: <b>React</b>, <b>Node.js</b>, <b>PostgreSQL</b>, <b>AWS</b>, <b>Docker</b>, <b>CI/CD</b>, <b>TypeScript</b>
   - Only wrap the skill/technology token itself — not entire sentences
   - Do not bold soft skills or generic words
   - Keep the <b> tags inside the JSON string values (valid JSON)

EXAMPLE OF TAILORING:
If applying for "Ruby on Rails Developer" and original experience was in "Web Development":
- Adjust title to "Ruby on Rails Developer"${tailorCompanyNames ? '' : ' ONLY if tailorCompanyNames is ON — otherwise keep the original title'}
- Include bullet points about web development, database management, API development
- Emphasize experience with similar frameworks (if any) or rapid learning abilities
- Highlight problem-solving, debugging, and software development lifecycle experience, and Ruby on Rails experience
${tailorCompanyNames ? `
EXAMPLE OF COMPANY SUBSTITUTION (when tailorCompanyNames is ON):
If applying to a mid-market healthcare case-management software vendor (~50–200 employees):
- Most recent employer → another lesser-known mid-market health-IT / care-management software company (NOT Epic, Cerner/Oracle Health, Optum, UnitedHealth, or other famous giants), with a tailored role title
- Second most recent → a different mid-sized niche healthcare software or payer-tech firm of similar scale
- Older employers → keep original company names unchanged
- Wrong examples to avoid: Google, Amazon, Microsoft, Optum, Epic, Salesforce, IBM
` : ''}
IMPORTANT JSON FORMATTING RULES:
- Respond with ONLY valid COMPLETE JSON - no markdown code blocks, no extra text, no truncated output
- The generated number of positions must be the same as the original experience (${experience.length} positions)
- Every experience item MUST include a non-empty "descriptions" array
${tailorCompanyNames
    ? '- For the two most recent roles, company names (and preferably addresses) SHOULD change to mid-sized lesser-known peers per the research rules above; keep older company names unchanged. Role titles SHOULD be tailored.'
    : '- Keep all original company names and job titles unchanged. Only tailor descriptions, summary, and skills.'}
- Must follow the response format exactly.

Response format:
{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "${tailorCompanyNames ? 'Tailored Job Title' : 'Original Job Title (unchanged)'}",
      "company": "${tailorCompanyNames ? 'Mid-sized lesser-known peer/rival for recent roles; original otherwise' : 'Original Company Name (unchanged)'}",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Built APIs with <b>Node.js</b> and <b>TypeScript</b> on <b>AWS</b>...",
        "Led frontend delivery using <b>React</b> and <b>Next.js</b>...",
        "Optimized <b>PostgreSQL</b> queries and improved performance...",
        "Technical accomplishment using relevant technologies...",
        "Collaboration experience valuable for the target position...",
        "Problem-solving that shows adaptability...",
        "Delivery experience relevant to the target role...",
        "Cross-functional work demonstrating team skills..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};
