import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Initialize OpenAI client (server-side, safe to use API key)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface RequestBody {
  profile: any;
  jobDescription: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profile, jobDescription } = req.body as RequestBody;

    if (!profile || !jobDescription) {
      return res.status(400).json({ error: 'Missing required fields: profile and jobDescription' });
    }

    // Create the AI prompt
    const prompt = createAIPrompt(profile, jobDescription);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume writer who tailors resumes for specific job applications while keeping them believable and human-written. Align the candidate with the target role through selective emphasis—not by rewriting every role to mirror the job posting. Use technologies and titles from the job description only where they fit the original experience, time period, and career progression. The summary and most recent role may emphasize the target stack most strongly; older roles should reflect what that job actually involved. Do not stuff the same job-posting keywords into every company or bullet. Keep all original company names and the same number of positions. Generate 7-12 bullet points per work experience, with varying counts based on role complexity and duration. Extract the job title and company name from the job description. You MUST respond with ONLY valid JSON - no additional text, explanations, or markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 5000,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';

    // Return the AI response
    return res.status(200).json({
      success: true,
      aiResponse
    });

  } catch (error: any) {
    console.error('Error generating resume:', error);
    return res.status(500).json({
      error: 'Failed to generate resume',
      details: error.message
    });
  }
}

const createAIPrompt = (profile: any, jobDescription: string): string => {
  return `
Please create a tailored but authentic resume for the following job description. The goal is to position the candidate as a strong fit for this role while the resume still reads like a real person's career history—not an AI keyword-stuffed version of the job ad.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || 'Not provided'}

ORIGINAL EXPERIENCE (Use as inspiration but don't be limited by it):
${profile.experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || 'Not provided'}
  Original Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${profile.skills.filter((skill: string) => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING (AUTHENTIC, HUMAN-LIKE):
1. ANALYZE the job description to identify job title, company name, required skills, responsibilities, and terminology—but use them selectively, not in every bullet.

2. SELECTIVE EMPHASIS (do not mirror the job ad in every role):
   - Professional summary: Clearly connect the candidate to the target role; mention key stack/requirements where credible.
   - Most recent 1–2 positions: Strongest alignment with the target role—emphasize overlapping skills, similar stacks, and relevant achievements from the ORIGINAL experience.
   - Older positions: Keep bullets grounded in what that role likely involved per the original description and dates. Use period-appropriate tech from the original profile; do NOT claim the target job's exact stack (e.g. Angular + TypeScript) at every employer unless the original experience supports it.
   - Never repeat the same job-posting phrase or technology name in every bullet across all companies.

3. TECHNOLOGY AND CLAIMS:
   - Only name a technology from the job description in a role if it appears in that role's original description, the candidate's skills, or a clearly similar stack (e.g. React experience → transferable to Angular) stated as transferability—not as years of fake Angular at every job.
   - Prefer outcomes, scope, and responsibilities over keyword lists.
   - Vary bullet wording; avoid copying sentences from the job description.

4. JOB TITLES:
   - Keep original position titles unless a small, honest reframing fits the original role (e.g. "Software Developer" → "Full Stack Developer" if the original work supports it).
   - Do NOT rename every past job to the target title (e.g. do not make every role "Angular + TypeScript Developer").
   - Keep company names exactly as provided.

Please provide the following in JSON format:

1. Extract the job title and company name from the job description
2. A compelling professional summary that positions the candidate for this specific role
3. Enhanced work experience with 7-12 bullet points per position that:
   - Reflect the original role's scope; tailor intensity by recency (strongest in latest roles)
   - Use job-description technologies only where credible for that position and timeframe
   - Show quantifiable achievements and measurable impact
   - Mix technical, collaboration, and delivery bullets—not every bullet listing the target stack
   - Vary bullet point count based on role complexity and duration
4. Enhanced skills list: merge current skills with job-relevant skills the candidate can plausibly claim; do not invent skills with no basis in the profile or experience

EXAMPLE OF GOOD TAILORING (Angular + TypeScript Developer target, original mix of .NET and React):
- Summary: Full stack developer with strong TypeScript and modern SPA experience; eager to deepen Angular in product-focused teams.
- Latest role: Bullets mention TypeScript, component architecture, REST APIs—aligned with posting where original work supports it.
- Older .NET-heavy role: Bullets stay .NET/C#/API-focused; at most one bullet notes transferable front-end or TypeScript exposure if in the original text—not five Angular bullets.

IMPORTANT JSON FORMATTING RULES:
- Respond with ONLY valid JSON - no markdown code blocks, no extra text
- Ensure you do not remove any original company names or job titles. The generated number of positions should be the same as the original experience.
- Must follow the response format exactly.

Response format:
{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Job title (use original or company-appropriate title, not target-role title)",
      "company": "Company Name", 
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Bullet grounded in actual experience at this company, emphasizing transferable skills...",
        "Achievement or responsibility the candidate really had, worded for relevance to target role...",
        "Technical work using technologies they actually used at this company...",
        "Collaboration, ownership, or impact measurable and defensible in an interview..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};

