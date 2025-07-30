import OpenAI from 'openai';

interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: any[];
  education: any[];
  skills: string[];
}

interface GeneratedResume {
  summary: string;
  experience: any[];
  skills: string[];
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true, // Note: In production, this should be handled server-side
});

export const generateResume = async (profile: Profile, jobDescription: string): Promise<GeneratedResume> => {
  try {
    // Create a comprehensive prompt for the AI
    const prompt = createAIPrompt(profile, jobDescription);
    
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
    const enhancedData = parseAIResponse(profile, aiResponse);
    
    return enhancedData;
  } catch (error) {
    console.error('Error generating resume with AI:', error);
    // Return the original data if AI generation fails
    return {
      summary: profile.summary || '',
      experience: profile.experience,
      skills: profile.skills,
    };
  }
};

const createAIPrompt = (profile: Profile, jobDescription: string): string => {
  return `
Please enhance this resume for the following job description:

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || 'Not provided'}

EXPERIENCE:
${profile.experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

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
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "description": "Enhanced description with achievements..."
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Skill 3"]
}
`;
};

const parseAIResponse = (originalProfile: Profile, aiResponse: string): GeneratedResume => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Create enhanced resume data
    const enhancedData: GeneratedResume = {
      summary: parsed.summary || originalProfile.summary || '',
      experience: parsed.experience || originalProfile.experience,
      skills: parsed.skills || originalProfile.skills,
    };

    return enhancedData;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Return original data if parsing fails
    return {
      summary: originalProfile.summary || '',
      experience: originalProfile.experience,
      skills: originalProfile.skills,
    };
  }
};
