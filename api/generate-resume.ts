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
const MAX_JOB_DESCRIPTION_CHARS = 10000;
/** Resume body only — company substitution is a separate smaller call. */
const MAX_RESUME_OUTPUT_TOKENS = 8000;
const MAX_COMPANY_PICK_TOKENS = 1200;

const CLAUDE_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT_RESUME =
  'You are an expert resume writer specializing in career transitions and role-specific tailoring. Transform the candidate\'s experience to fit the target role. Generate 5-8 bullet points per work experience. Extract job title and company name from the job description. In experience bullet points, wrap each technical skill/tool/framework/language with <b>...</b> (e.g. <b>React</b>, <b>PostgreSQL</b>). Always return complete valid JSON with a non-empty experience array matching the original number of positions. Never truncate the JSON.';

const SYSTEM_PROMPT_COMPANY_PICK =
  'You research mid-market employers. Given a job description, identify the target company and industry, then propose real mid-sized lesser-known peer companies (roughly 50-500 employees) in that industry. Prefer a lesser-known rival for the most recent role. Never suggest FAANG, Fortune 500 household names, Big Tech, mega insurers, or mega EHR vendors. Never suggest the target company itself. Return only valid JSON.';

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

const COMPANY_PICK_SCHEMA = {
  type: 'object',
  properties: {
    targetCompany: { type: 'string' },
    industry: { type: 'string' },
    replacements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          company: { type: 'string' },
          address: { type: 'string' },
        },
        required: ['company', 'address'],
        additionalProperties: false,
      },
    },
  },
  required: ['targetCompany', 'industry', 'replacements'],
  additionalProperties: false,
};

interface RequestBody {
  profile: any;
  jobDescription: string;
  provider?: AIProvider;
  tailorCompanyNames?: boolean;
}

type CompanyReplacement = { company: string; address: string };

type CompanyPickResult = {
  targetCompany: string;
  industry: string;
  replacements: CompanyReplacement[];
};

function truncateJobDescription(jobDescription: string): string {
  const trimmed = jobDescription.trim();
  if (trimmed.length <= MAX_JOB_DESCRIPTION_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_JOB_DESCRIPTION_CHARS)}\n\n[Job description truncated for length; use the content above as the source of truth.]`;
}

function cloneProfile(profile: any) {
  return JSON.parse(JSON.stringify(profile));
}

function applyCompanyReplacements(profile: any, replacements: CompanyReplacement[]): any {
  const next = cloneProfile(profile);
  const experience = Array.isArray(next.experience) ? next.experience : [];
  const count = Math.min(2, replacements.length, experience.length);
  for (let i = 0; i < count; i++) {
    experience[i] = {
      ...experience[i],
      company: replacements[i].company,
      address: replacements[i].address || experience[i].address || '',
    };
  }
  next.experience = experience;
  return next;
}

function forceCompaniesOnAiJson(
  aiResponse: string,
  replacements: CompanyReplacement[]
): string {
  if (!replacements.length) return aiResponse;
  try {
    const parsed = JSON.parse(stripCodeFences(aiResponse));
    if (!Array.isArray(parsed.experience)) return aiResponse;
    const count = Math.min(2, replacements.length, parsed.experience.length);
    for (let i = 0; i < count; i++) {
      parsed.experience[i] = {
        ...parsed.experience[i],
        company: replacements[i].company,
        address: replacements[i].address || parsed.experience[i].address || '',
      };
    }
    return JSON.stringify(parsed);
  } catch {
    return aiResponse;
  }
}

function stripCodeFences(text: string): string {
  let jsonString = text.trim();
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return jsonString;
}

function parseJsonLoose(text: string): any {
  let jsonString = stripCodeFences(text);
  if (!jsonString.startsWith('{')) {
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    jsonString = jsonMatch[0];
  }
  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(jsonString);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const jd = truncateJobDescription(jobDescription);
    const shouldTailorCompanies = Boolean(tailorCompanyNames);
    let profileForGeneration = profile;
    let companyPick: CompanyPickResult | null = null;

    // Phase 1: pick mid-market peer companies (small, reliable JSON) then bake them into the profile
    if (shouldTailorCompanies) {
      try {
        companyPick = await pickSubstituteCompanies(profile, jd, provider);
        if (companyPick.replacements?.length) {
          profileForGeneration = applyCompanyReplacements(profile, companyPick.replacements);
        }
      } catch (pickError: any) {
        console.error('Company substitution failed; continuing with original companies:', pickError);
      }
    }

    // Phase 2: generate the resume with companies already set; stress industry on last 2 when enabled
    const prompt = createAIPrompt(profileForGeneration, jd, {
      tailorRoleTitles: shouldTailorCompanies,
      stressIndustryLast2: shouldTailorCompanies,
      industry: companyPick?.industry || '',
    });

    let aiResponse =
      provider === 'claude'
        ? await generateWithClaude(prompt, SYSTEM_PROMPT_RESUME, RESUME_OUTPUT_SCHEMA, MAX_RESUME_OUTPUT_TOKENS)
        : await generateWithOpenAI(prompt, SYSTEM_PROMPT_RESUME, MAX_RESUME_OUTPUT_TOKENS);

    if (!aiResponse?.trim()) {
      return res.status(502).json({
        error: 'Failed to generate resume',
        details: 'The AI returned an empty response. Please try again.',
      });
    }

    if (companyPick?.replacements?.length) {
      aiResponse = forceCompaniesOnAiJson(aiResponse, companyPick.replacements);
    }

    return res.status(200).json({
      success: true,
      aiResponse,
      provider,
      companyPick: companyPick
        ? {
            targetCompany: companyPick.targetCompany,
            industry: companyPick.industry,
            replacements: companyPick.replacements,
          }
        : null,
    });
  } catch (error: any) {
    console.error('Error generating resume:', error);
    return res.status(500).json({
      error: 'Failed to generate resume',
      details: error.message,
    });
  }
}

async function pickSubstituteCompanies(
  profile: any,
  jobDescription: string,
  provider: AIProvider
): Promise<CompanyPickResult> {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const recent = experience.slice(0, 2);
  const prompt = `
From this job description, identify the hiring company and its industry/field.

Then propose ${Math.min(2, Math.max(1, recent.length))} REAL mid-sized, lesser-known peer companies in that SAME industry to use as the candidate's most recent employer(s) on a resume.

SIZE & FAME RULES (STRICT):
- Prefer roughly 50–500 employees / niche mid-market firms
- Prefer obscure / regional / lesser-known companies (not household brands)
- DO NOT use FAANG, Big Tech, Fortune 500 household names, mega insurers/payers, or mega EHR vendors (Epic, Oracle Health/Cerner, Optum, UnitedHealth, Anthem/Elevance, Cigna, CVS/Aetna, Google, Amazon, Microsoft, Apple, Meta, IBM, Salesforce, etc.)
- DO NOT use the target hiring company itself
- First replacement should preferably be a lesser-known mid-market rival/competitor of the target
- Second replacement should be a different mid-sized peer in the same industry
- Use real company names only
- Provide a plausible HQ / major office city for each

JOB DESCRIPTION:
${jobDescription}

CANDIDATE CURRENT MOST RECENT EMPLOYERS (for context only — replace these):
${recent.map((exp: any, i: number) => `${i + 1}. ${exp.company || 'Unknown'} — ${exp.position || ''}`).join('\n')}

Return ONLY JSON:
{
  "targetCompany": "hiring company from the JD",
  "industry": "short industry/field label, e.g. healthcare case management software",
  "replacements": [
    { "company": "Mid-sized lesser-known peer/rival", "address": "City, State" }
  ]
}
`;

  const raw =
    provider === 'claude'
      ? await generateWithClaude(prompt, SYSTEM_PROMPT_COMPANY_PICK, COMPANY_PICK_SCHEMA, MAX_COMPANY_PICK_TOKENS)
      : await generateWithOpenAI(prompt, SYSTEM_PROMPT_COMPANY_PICK, MAX_COMPANY_PICK_TOKENS);

  const parsed = parseJsonLoose(raw) as CompanyPickResult;
  if (!parsed?.replacements || !Array.isArray(parsed.replacements) || parsed.replacements.length === 0) {
    throw new Error('Company pick returned no replacements');
  }

  return {
    targetCompany: String(parsed.targetCompany || ''),
    industry: String(parsed.industry || ''),
    replacements: parsed.replacements
      .slice(0, 2)
      .map((r) => ({
        company: String(r.company || '').trim(),
        address: String(r.address || '').trim(),
      }))
      .filter((r) => r.company),
  };
}

async function generateWithOpenAI(
  prompt: string,
  systemPrompt: string,
  maxTokens: number
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7,
    max_tokens: maxTokens,
  });

  const content = completion.choices[0]?.message?.content || '';
  if (completion.choices[0]?.finish_reason === 'length') {
    console.warn('OpenAI response truncated due to max_tokens');
  }
  return content;
}

async function generateWithClaude(
  prompt: string,
  systemPrompt: string,
  schema: Record<string, unknown>,
  maxTokens: number
): Promise<string> {
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
    output_config: {
      format: {
        type: 'json_schema',
        schema,
      },
    },
  });

  if (message.stop_reason === 'max_tokens') {
    console.warn('Claude response truncated due to max_tokens');
  }

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

const createAIPrompt = (
  profile: any,
  jobDescription: string,
  options: {
    tailorRoleTitles: boolean;
    stressIndustryLast2: boolean;
    industry: string;
  }
): string => {
  const experience = Array.isArray(profile.experience) ? profile.experience : [];
  const education = Array.isArray(profile.education) ? profile.education : [];
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  const { tailorRoleTitles, stressIndustryLast2, industry } = options;

  const roleInstructions = tailorRoleTitles
    ? `
4. ROLE TITLES (REQUIRED):
   - Tailor "position" / job titles toward the target role
   - Most recent: closely match or sit one step below the target job title
   - Earlier roles: show clear progression toward the target role
   - Keep EVERY company name and address EXACTLY as provided in ORIGINAL EXPERIENCE (already researched/substituted when needed)
   - Keep start_date / end_date and the number of experience entries identical to the original
`
    : `
4. COMPANY NAMES & ROLE TITLES (REQUIRED):
   - Keep EVERY company name EXACTLY as provided in ORIGINAL EXPERIENCE
   - Keep EVERY position / job title EXACTLY as provided in ORIGINAL EXPERIENCE
   - Keep addresses and dates as provided
   - Only rewrite bullet point descriptions (and summary/skills)
`;

  const industryInstructions = stressIndustryLast2
    ? `
5. INDUSTRY EXPERIENCE FOR THE LAST 2 ROLES (REQUIRED):
   - Target industry/field: ${industry || 'infer from the job description'}
   - For ONLY the two most recent roles (first two experience entries), heavily stress hands-on experience in that industry field
   - Include domain workflows, regulations, data models, business problems, and terminology from that field in MOST bullets for those two roles
   - Make industry exposure obvious (not generic software work that could be any industry)
   - Still include relevant technical skills from the JD with <b>...</b> tags
   - Older roles do not need this industry emphasis
`
    : '';

  return `
Please create a highly tailored resume for the following job description.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

ORIGINAL EXPERIENCE (companies/addresses are authoritative — keep them exactly):
${experience
  .map(
    (exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || ''}
  Original Description: ${exp.description || ''}
`
  )
  .join('\n')}

EDUCATION:
${education
  .map(
    (edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`
  )
  .join('\n')}

CURRENT SKILLS:
${skills.filter((skill: string) => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description for job title, company name, required skills, responsibilities, and terminology.

2. TRANSFORM each work experience:
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include technologies/tools from the job description where natural
   - Don't use complex words like "scalability", "reliability", or "robust". Keep it simple
   - Write 5-8 complete bullet points per position (never leave descriptions empty)

3. CREATIVE TAILORING:
   - Incorporate relevant technologies without mirroring the JD stack too closely
   - Highlight transferable skills, collaboration, and delivery impact
${roleInstructions}${industryInstructions}
Please respond with ONLY valid COMPLETE JSON (no markdown):

{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "${tailorRoleTitles ? 'Tailored Job Title' : 'Original Job Title (unchanged)'}",
      "company": "EXACT company name from ORIGINAL EXPERIENCE",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "EXACT address from ORIGINAL EXPERIENCE when provided",
      "descriptions": [
        "Bullet with <b>Tech</b> and relevant impact...",
        "Another complete bullet..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}

IMPORTANT:
- Number of experience entries MUST be ${experience.length}
- Every experience item MUST have a non-empty "descriptions" array
- Keep company names exactly as listed in ORIGINAL EXPERIENCE
${tailorRoleTitles ? '- Tailor role titles' : '- Keep role titles exactly as listed'}
${stressIndustryLast2 ? '- Stress the target industry in bullets for the first two (most recent) roles' : ''}
- Complete the full JSON — do not truncate
`;
};
