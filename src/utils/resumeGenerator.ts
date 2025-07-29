import OpenAI from 'openai';
import { ResumeData } from '../types/resume';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Note: In production, this should be handled server-side
});

export const generateResume = async (data: ResumeData): Promise<ResumeData> => {
  try {
    // Create a comprehensive prompt for the AI
    const prompt = createAIPrompt(data);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert resume writer and career coach. Your task is to enhance a resume based on a job description. Focus on making the resume more relevant and compelling for the specific role."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const aiResponse = completion.choices[0]?.message?.content;
    
    if (!aiResponse) {
      throw new Error('No response from AI');
    }

    // Parse the AI response and enhance the resume data
    const enhancedData = parseAIResponse(data, aiResponse);
    
    return enhancedData;
  } catch (error) {
    console.error('Error generating resume with AI:', error);
    // Return the original data if AI generation fails
    return data;
  }
};

const createAIPrompt = (data: ResumeData): string => {
  const { personalInfo, experience, education, skills, jobDescription, summary } = data;
  
  return `
Please enhance this resume for the following job description:

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${personalInfo.firstName} ${personalInfo.lastName}
Current Summary: ${summary || 'Not provided'}

EXPERIENCE:
${experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.startDate} - ${exp.current ? 'Present' : exp.endDate})
  Description: ${exp.description}
`).join('\n')}

EDUCATION:
${education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.institution} (${edu.startDate} - ${edu.current ? 'Present' : edu.endDate})
`).join('\n')}

CURRENT SKILLS:
${skills.filter(skill => skill.trim()).join(', ')}

Please provide the following enhancements in JSON format:

1. An improved professional summary that highlights relevant experience and skills for this specific role
2. Enhanced descriptions for each work experience that emphasize achievements and skills relevant to the job
3. A prioritized list of skills that match the job requirements

Return your response in this exact JSON format:
{
  "summary": "Enhanced professional summary...",
  "experience": [
    {
      "company": "Company Name",
      "position": "Job Title",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM",
      "current": false,
      "description": "Enhanced description with achievements...",
      "achievements": ["Achievement 1", "Achievement 2"]
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Skill 3"]
}
`;
};

const parseAIResponse = (originalData: ResumeData, aiResponse: string): ResumeData => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Create enhanced resume data
    const enhancedData: ResumeData = {
      ...originalData,
      generatedContent: {
        summary: parsed.summary || originalData.summary,
        experience: parsed.experience || originalData.experience,
        skills: parsed.skills || originalData.skills,
      }
    };

    return enhancedData;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Return original data if parsing fails
    return originalData;
  }
};
