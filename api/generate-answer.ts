import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

// Initialize OpenAI client (server-side, safe to use API key)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface RequestBody {
  profile: any;
  question: string;
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

    const { profile, question, jobDescription, resumeContent } = req.body as RequestBody;

    if (!profile || !question || !jobDescription || !resumeContent) {
      return res.status(400).json({ error: 'Missing required fields: profile, question, jobDescription, and resumeContent' });
    }

    // Create the AI prompt for answer
    const prompt = createAnswerPrompt(profile, question, jobDescription, resumeContent);

    // Call OpenAI API for answer
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional job application consultant. Generate concise, thoughtful, specific, and compelling answers to job application questions. Your answers should be authentic, demonstrate relevant experience, and align with the candidate\'s background and the job requirements. Keep responses brief and direct - avoid unnecessary elaboration.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const answerContent = completion.choices[0]?.message?.content || '';

    // Return the response
    return res.status(200).json({
      success: true,
      content: answerContent,
      question: question
    });

  } catch (error: any) {
    console.error('Error generating answer:', error);
    return res.status(500).json({
      error: 'Failed to generate answer',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

const createAnswerPrompt = (profile: any, question: string, jobDescription: string, resumeContent: any): string => {
  return `
Please provide a thoughtful answer to the following job application question:

QUESTION:
${question}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Title: ${profile.title || 'Not specified'}
Email: ${profile.email}
Location: ${profile.location || 'Not specified'}

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

Please provide an answer that:
1. Directly addresses the specific question asked
2. Uses concrete examples from the candidate's experience
3. Demonstrates relevant skills and knowledge
4. Shows enthusiasm and genuine interest
5. Aligns with the job requirements
6. Is authentic and personal to the candidate
7. Is well-structured and easy to read
8. Uses the candidate's actual background and experience
9. Maintains a professional yet conversational tone

The answer should be:
- Specific and concise
- Relevant to the question and job
- Based on the candidate's actual experience
- Professional but engaging
- Approximately 30-50 words (keep it brief and to the point)

Please write the answer in the candidate's voice, using their actual experience and background. Be direct and avoid unnecessary elaboration.
`;
};

