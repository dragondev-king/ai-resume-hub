import OpenAI from 'openai';
import { ProfileWithDetailsRPC } from '../lib/supabase';

// Using ProfileWithDetailsRPC type from supabase.ts
type Profile = ProfileWithDetailsRPC;

interface GeneratedCoverLetter {
  content: string;
  jobTitle?: string;
  companyName?: string;
}

interface GeneratedAnswer {
  content: string;
  question: string;
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const generateCoverLetter = async (
  profile: Profile, 
  jobDescription: string, 
  resumeContent: any
): Promise<GeneratedCoverLetter> => {
  try {
    const prompt = createCoverLetterPrompt(profile, jobDescription, resumeContent);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
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
      max_tokens: 1500,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';
    
    // Extract job title and company name from the job description
    const jobInfo = await extractJobInfo(jobDescription);
    
    return {
      content: aiResponse,
      jobTitle: jobInfo.jobTitle,
      companyName: jobInfo.companyName
    };
  } catch (error) {
    console.error('Error generating cover letter:', error);
    throw new Error('Failed to generate cover letter');
  }
};

export const generateAnswer = async (
  profile: Profile,
  question: string,
  jobDescription: string,
  resumeContent: any
): Promise<GeneratedAnswer> => {
  try {
    const prompt = createAnswerPrompt(profile, question, jobDescription, resumeContent);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
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

    const aiResponse = completion.choices[0]?.message?.content || '';
    
    return {
      content: aiResponse,
      question: question
    };
  } catch (error) {
    console.error('Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
};

const createCoverLetterPrompt = (profile: Profile, jobDescription: string, resumeContent: any): string => {
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
${profile.experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

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

const createAnswerPrompt = (profile: Profile, question: string, jobDescription: string, resumeContent: any): string => {
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
${profile.experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

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

const extractJobInfo = async (jobDescription: string): Promise<{ jobTitle: string; companyName: string }> => {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at extracting job information from job descriptions. Extract the job title and company name from the provided job description. If the information is not clearly stated, make your best educated guess based on the context.'
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