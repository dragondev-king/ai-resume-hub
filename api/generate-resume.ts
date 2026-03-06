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
          content: 'You are an expert resume writer. Your goal is to present the candidate\'s real experience in a way that highlights relevance to the target role WITHOUT fabricating or inventing. Work experience must stay truthful: each company\'s industry and domain (e.g., Salesforce = CRM/sales tech) must be reflected in the bullet points. Never add job-specific industry context (e.g., satellites, GNSS, aerospace) to a company that is not in that industry—candidates will be asked about this in interviews. Only mention technologies, tools, and domains the candidate could plausibly have used at that company. Tailoring means: emphasizing transferable skills, choosing which parts of their real experience to highlight, and using clear action verbs—not inventing new responsibilities or technologies. Generate 7-12 bullet points per work experience. Extract job title and company name from the job description. Keep company names unchanged. You MUST respond with ONLY valid JSON - no additional text, explanations, or markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: 2000,
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
Create a resume that highlights the candidate's relevance to this role while staying truthful. Work experience must reflect what they actually did at each company—never invent industry domain or technologies (e.g., do not add satellite/GNSS experience for a non-space company; they will be asked about it in interviews).

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

TRUTHFULNESS GUARDRAILS (MUST FOLLOW):
- Each work experience must stay true to what the candidate actually did at THAT company. The company's real industry and domain must be consistent with every bullet (e.g., a Salesforce company = CRM, sales tech, enterprise software—never satellites, GNSS, or aerospace unless the company is in that industry).
- Do NOT add job-specific industry context, technologies, or terminology to a company where it would not apply. Example: if the target role is "Spacecraft Software Engineer" at a satellite company but the candidate's last role was at a Salesforce/CRM company, do NOT write bullets about satellite data, GNSS, or payloads for that company—only highlight transferable skills (e.g., data pipelines, reliability, software engineering, collaboration) in the context of what they really did there.
- Only mention technologies and tools the candidate could plausibly have used in that role and company. Do not invent use of job-required technologies (e.g., FPGA, GNSS) unless the original experience supports it.
- Job titles may be slightly adjusted for clarity or progression but must remain believable for that company (e.g., "Software Engineer" at a known CRM company, not "Spacecraft Software Engineer" at that same company).

TAILORING (SAFE—DO THIS):
1. ANALYZE the job description for: job title and company name, required skills, responsibilities, and transferable themes (e.g., "data pipelines", "reliability", "collaboration with operations").
2. For each work experience, REWRITE and EMPHASIZE based on the candidate's ORIGINAL description only:
   - Highlight transferable skills and achievements that align with the target role (e.g., building data pipelines, ensuring data quality, cross-functional collaboration) without changing the domain or inventing technologies.
   - Use action verbs and clearer wording; lead with the most relevant aspects of their real experience.
   - Keep the company's actual industry and context in every bullet so the candidate can speak to it honestly in interviews.
3. Job titles: Prefer the candidate's original position titles, or use industry-appropriate titles that still match the company (e.g., "Software Engineer", "Senior Developer"). Do not assign target-role-specific titles (e.g., "Spacecraft Software Engineer") to past roles at unrelated companies.
4. Keep company names exactly as provided.

Please provide the following in JSON format:

1. Extract the job title and company name from the job description.
2. A compelling professional summary that positions the candidate for this specific role (summary may be tailored; it is not company-specific).
3. Work experience with 7-12 bullet points per position that:
   - Are grounded in the candidate's ORIGINAL experience and the company's real industry
   - Emphasize transferable skills and achievements relevant to the target role without inventing domain or technologies
   - Use action verbs and quantifiable impact where possible
   - Would be defensible in an interview (candidate can truthfully explain each bullet for that company)
   - Vary bullet point count based on role complexity and duration
4. Skills list: include the candidate's current skills; only add skills from the job description if the candidate could plausibly have used them (do not list job-only technologies they have not used).

EXAMPLE OF SAFE TAILORING:
- Target role: "Spacecraft Software Engineer" at Spire (satellite/GNSS). Candidate's last role: "Software Engineer" at a Salesforce/CRM company.
- CORRECT: Bullets about building data pipelines, ensuring data quality, collaborating with operations, backend systems, Python/C++ if in their experience—all in the context of CRM/sales tech. Title at that company remains e.g. "Software Engineer".
- WRONG: Any bullet mentioning satellites, GNSS, spacecraft, or payloads for that CRM company; or changing that company's title to "Spacecraft Software Engineer".

IMPORTANT JSON FORMATTING RULES:
- Respond with ONLY valid JSON - no markdown code blocks, no extra text
- Do NOT use trailing commas in arrays or objects
- Properly escape special characters in strings (newlines as \\n, quotes as \\", backslashes as \\\\)
- Ensure all strings are properly quoted
- Ensure all arrays and objects are properly closed

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

