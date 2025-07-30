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
  experience: {
    position: string;
    company: string;
    start_date: string;
    end_date: string;
    location?: string;
    descriptions: string[]; // Array of bullet points
  }[];
  skills: string[];
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const generateResume = async (profile: Profile, jobDescription: string): Promise<GeneratedResume> => {
  try {
    // Create a comprehensive prompt for the AI
    const prompt = createAIPrompt(profile, jobDescription);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a professional resume writer and career coach. Generate high-quality, specific, and impactful resume content that highlights achievements and quantifiable results. Always provide at least 5 bullet points per work experience.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const aiResponse = completion.choices[0]?.message?.content || '';
    
    // Parse the AI response and enhance the resume data
    const enhancedData = parseAIResponse(profile, aiResponse);
    
    return enhancedData;
  } catch (error) {
    console.error('Error generating resume with AI:', error);
    // Return the original data if AI generation fails
    return {
      summary: profile.summary || '',
      experience: profile.experience.map(exp => ({
        position: exp.position,
        company: exp.company,
        start_date: exp.start_date,
        end_date: exp.end_date,
        location: exp.location,
        descriptions: exp.description ? [exp.description] : []
      })),
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
  Current Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

Please provide the following enhancements in JSON format:

1. A compelling professional summary (3 sentences)
2. Enhanced work experience with MORE THAN 10 bullet points per position that:
   - Reference the original work experience
   - Include specific achievements and quantifiable results
   - Use action verbs and industry-specific terminology
   - Align with the job description requirements
3. Enhanced skills list that includes relevant technical and soft skills

IMPORTANT REQUIREMENTS:
- Generate MORE THAN 10 bullet points for each work experience
- Each bullet point should be a complete sentence starting with an action verb
- Include specific metrics, percentages, or quantifiable results where possible
- Reference the original work experience but enhance it significantly
- Make bullet points specific and impactful
- Use industry-standard terminology

Please respond with ONLY valid JSON in this exact format:
{
  "summary": "Professional summary here...",
  "experience": [
    {
      "position": "Job Title",
      "company": "Company Name", 
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "location": "City, State",
      "descriptions": [
        "First bullet point with specific achievement...",
        "Second bullet point with quantifiable result...",
        "Third bullet point highlighting key responsibility...",
        "Fourth bullet point showing impact...",
        "Fifth bullet point demonstrating leadership or innovation..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
};

const parseAIResponse = (originalProfile: Profile, aiResponse: string): GeneratedResume => {
  try {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate and enhance the parsed data
    const enhancedData: GeneratedResume = {
      summary: parsed.summary || originalProfile.summary || '',
      experience: parsed.experience || originalProfile.experience.map(exp => ({
        position: exp.position,
        company: exp.company,
        start_date: exp.start_date,
        end_date: exp.end_date,
        location: exp.location,
        descriptions: exp.description ? [exp.description] : []
      })),
      skills: parsed.skills || originalProfile.skills,
    };

    // Ensure each experience has at least 5 descriptions
    enhancedData.experience = enhancedData.experience.map(exp => {
      if (!exp.descriptions || exp.descriptions.length < 5) {
        // If AI didn't provide enough descriptions, use original and pad
        const originalDesc = exp.descriptions?.[0] || 'Contributed to team success and project delivery.';
        const paddedDescriptions = [
          originalDesc,
          'Collaborated with cross-functional teams to deliver high-quality solutions.',
          'Demonstrated strong problem-solving skills and attention to detail.',
          'Maintained excellent communication with stakeholders and team members.',
          'Contributed to process improvements and best practices implementation.'
        ];
        return {
          ...exp,
          descriptions: paddedDescriptions
        };
      }
      return exp;
    });

    return enhancedData;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    // Return original data if parsing fails
    return {
      summary: originalProfile.summary || '',
      experience: originalProfile.experience.map(exp => ({
        position: exp.position,
        company: exp.company,
        start_date: exp.start_date,
        end_date: exp.end_date,
        location: exp.location,
        descriptions: exp.description ? [exp.description] : []
      })),
      skills: originalProfile.skills,
    };
  }
};
