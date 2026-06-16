import toast from 'react-hot-toast';
import { ProfileWithDetailsRPC } from '../lib/supabase';

// Using ProfileWithDetailsRPC type from supabase.ts
type Profile = ProfileWithDetailsRPC;

interface GeneratedResume {
  summary: string;
  experience: {
    position: string;
    company: string;
    start_date: string;
    end_date: string;
    descriptions: string[]; // Array of bullet points
    address?: string; // Company address
  }[];
  skills: string[];
  jobTitle?: string;
  companyName?: string;
}

export type AIProvider = 'openai' | 'claude';

export const generateResume = async (
  profile: Profile,
  jobDescription: string,
  provider: AIProvider = 'openai'
): Promise<GeneratedResume> => {
  try {
    const response = await fetch('/api/generate-resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        jobDescription,
        provider,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate resume');
    }

    const data = await response.json();
    const aiResponse = data.aiResponse;
    
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
        descriptions: exp.description ? [exp.description] : [],
        address: exp.address
      })),
      skills: profile.skills,
      jobTitle: '',
      companyName: ''
    };
  }
};

const parseAIResponse = (originalProfile: Profile, aiResponse: string | Record<string, unknown>): GeneratedResume => {
  try {
    const parsed =
      typeof aiResponse === 'string'
        ? parseJsonResponse(aiResponse)
        : aiResponse;

    console.log(parsed, '=== parsed')
    
    // Validate and enhance the parsed data
    const enhancedData: GeneratedResume = {
      summary: (parsed.summary as string) || originalProfile.summary || '',
      experience: (parsed.experience as GeneratedResume['experience']) || originalProfile.experience.map(exp => ({
        position: exp.position,
        company: exp.company,
        start_date: exp.start_date,
        end_date: exp.end_date,
        descriptions: exp.description ? [exp.description] : [],
        address: exp.address
      })),
      skills: (parsed.skills as string[]) || originalProfile.skills,
      jobTitle: (parsed.jobTitle as string) || '',
      companyName: (parsed.companyName as string) || ''
    };

    console.log(enhancedData, '=== enhancedData')

    return enhancedData;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    if (typeof aiResponse === 'string') {
      console.error('AI Response preview (first 500 chars):', aiResponse.substring(0, 500));
      console.error('AI Response preview (last 500 chars):', aiResponse.substring(Math.max(0, aiResponse.length - 500)));
    } else {
      console.error('AI Response object:', aiResponse);
    }
    toast.error("An error occurred while parsing the AI response")
    
    // Return original data if parsing fails
    return {
      summary: '',
      experience: [],
      skills: originalProfile.skills,
    };
  }
};

const parseJsonResponse = (aiResponse: string): Record<string, unknown> => {
  let jsonString = aiResponse.trim();

  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonString.startsWith('```')) {
    jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  if (!jsonString.startsWith('{')) {
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    } else {
      throw new Error('No JSON found in response');
    }
  }

  jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');

  return JSON.parse(jsonString);
};
