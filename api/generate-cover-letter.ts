import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Initialize OpenAI client (server-side, safe to use API key)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface RequestBody {
  profile: any;
  jobDescription: string;
  resumeContent: any;
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
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not configured');
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'OpenAI API key is not configured. Please set OPENAI_API_KEY environment variable in Vercel dashboard.'
      });
    }

    const { profile, jobDescription, resumeContent } = req.body as RequestBody;

    if (!profile || !jobDescription || !resumeContent) {
      return res.status(400).json({ error: 'Missing required fields: profile, jobDescription, and resumeContent' });
    }

    // Create the AI prompt for cover letter
    const prompt = createCoverLetterPrompt(profile, jobDescription, resumeContent);

    // Call OpenAI API for cover letter
    const completion = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional cover letter writer. Generate concise, compelling, personalized cover letters that highlight the candidate\'s relevant experience and skills for the specific job. The cover letter should be professional, engaging, and demonstrate why the candidate is the perfect fit for the position. Keep responses brief and impactful - avoid unnecessary verbosity.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_completion_tokens: 1500,
    });

    const coverLetterContent = completion.choices[0]?.message?.content || '';

    // Extract job info
    const jobInfo = await extractJobInfo(jobDescription);

    // Return the response
    return res.status(200).json({
      success: true,
      content: coverLetterContent,
      jobTitle: jobInfo.jobTitle,
      companyName: jobInfo.companyName
    });

  } catch (error: any) {
    console.error('Error generating cover letter:', error);
    return res.status(500).json({
      error: 'Failed to generate cover letter',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

const createCoverLetterPrompt = (profile: any, jobDescription: string, resumeContent: any): string => {
  return `
Please write a compelling cover letter for the following job application:

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Title: ${profile.title || 'Not specified'}
Email: ${profile.email}
Location: ${profile.location || 'Not specified'}
LinkedIn: ${profile.linkedin || 'Not provided'}
Portfolio: ${profile.portfolio || 'Not provided'}

CANDIDATE'S BACKGROUND:
Summary: ${profile.summary || 'Not provided'}

EXPERIENCE:
${profile.experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

SKILLS:
${profile.skills.filter((skill: string) => skill.trim()).join(', ')}

AI-GENERATED RESUME CONTENT:
Summary: ${resumeContent.summary || 'Not available'}
Enhanced Experience: ${JSON.stringify(resumeContent.experience || [], null, 2)}
Enhanced Skills: ${resumeContent.skills ? resumeContent.skills.join(', ') : 'Not available'}

Please write a professional cover letter that:
1. Addresses the specific job requirements from the job description
2. Highlights the candidate's most relevant experience and skills
3. Demonstrates enthusiasm for the position and company
4. Explains why the candidate is the perfect fit
5. Includes specific examples from their experience
6. Maintains a professional yet engaging tone
7. Is approximately 50-70 words (keep it concise and impactful)
8. Uses the candidate's actual name and background information
9. References specific aspects of the job description

The cover letter should be well-structured with:
- Professional greeting
- Brief opening paragraph (1-2 sentences)
- 1-2 body paragraphs highlighting relevant experience (keep each paragraph short)
- Strong closing paragraph (1-2 sentences)
- Professional sign-off

Please write the cover letter in a natural, conversational tone that sounds authentic to the candidate. Be concise and avoid unnecessary verbosity.
`;
};

const extractJobInfo = async (jobDescription: string): Promise<{ jobTitle: string; companyName: string }> => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting job information from job descriptions. Extract the job title and company name from the provided job description. If the information is not clearly stated, make your best educated guess based on the context. You MUST respond with ONLY valid JSON - no additional text, explanations, or markdown formatting.'
        },
        {
          role: 'user',
          content: `Please extract the job title and company name from this job description. If not explicitly stated, infer from context:

${jobDescription}

Respond with ONLY valid JSON in this exact format:
{
  "jobTitle": "extracted or inferred job title",
  "companyName": "extracted or inferred company name"
}`
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 200,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';

    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in job info response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      jobTitle: parsed.jobTitle || 'Not specified',
      companyName: parsed.companyName || 'Not specified'
    };
  } catch (error) {
    console.error('Error extracting job info:', error);
    return {
      jobTitle: 'Not specified',
      companyName: 'Not specified'
    };
  }
};

