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
  provider: AIProvider = 'openai',
  tailorCompanyNames: boolean = false
): Promise<GeneratedResume> => {
  const response = await fetch('/api/generate-resume', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      profile,
      jobDescription,
      provider,
      tailorCompanyNames,
    }),
  });

  if (!response.ok) {
    let message = 'Failed to generate resume';
    try {
      const errorData = await response.json();
      message = errorData.details || errorData.error || message;
    } catch {
      // ignore JSON parse errors on error body
    }
    throw new Error(message);
  }

  const data = await response.json();
  const aiResponse = data.aiResponse;

  if (!aiResponse || (typeof aiResponse === 'string' && !aiResponse.trim())) {
    throw new Error('The AI returned an empty resume response. Please try again.');
  }

  return parseAIResponse(profile, aiResponse, tailorCompanyNames);
};

const parseAIResponse = (
  originalProfile: Profile,
  aiResponse: string | Record<string, unknown>,
  tailorCompanyNames: boolean = false
): GeneratedResume => {
  try {
    const parsed =
      typeof aiResponse === 'string'
        ? parseJsonResponse(aiResponse)
        : aiResponse;

    console.log(parsed, '=== parsed');

    if (!Array.isArray(parsed.experience) || parsed.experience.length === 0) {
      throw new Error('AI response did not include any experience entries');
    }

    const aiExperience = parsed.experience as GeneratedResume['experience'];

    // When company/role tailoring is off, lock company + position (+ dates/address) to the profile
    // so only bullet points / summary / skills are AI-rewritten.
    const experience = tailorCompanyNames
      ? aiExperience.map((aiExp, index) => {
          const original = originalProfile.experience?.[index];
          return {
            position: aiExp.position || original?.position || '',
            company: aiExp.company || original?.company || '',
            start_date: aiExp.start_date || original?.start_date || '',
            end_date: aiExp.end_date || original?.end_date || '',
            address: aiExp.address || original?.address || '',
            descriptions: Array.isArray(aiExp.descriptions) ? aiExp.descriptions : [],
          };
        })
      : (originalProfile.experience || []).map((exp, index) => {
          const aiExp = aiExperience[index];
          return {
            position: exp.position,
            company: exp.company,
            start_date: exp.start_date,
            end_date: exp.end_date,
            address: exp.address,
            descriptions: aiExp?.descriptions?.length
              ? aiExp.descriptions
              : exp.description
                ? [exp.description]
                : [],
          };
        });

    if (experience.some((exp) => !exp.descriptions?.length)) {
      console.warn('One or more experience entries have empty descriptions');
    }

    const enhancedData: GeneratedResume = {
      summary: (parsed.summary as string) || originalProfile.summary || '',
      experience,
      skills: (parsed.skills as string[]) || originalProfile.skills || [],
      jobTitle: (parsed.jobTitle as string) || '',
      companyName: (parsed.companyName as string) || '',
    };

    console.log(enhancedData, '=== enhancedData');

    return enhancedData;
  } catch (error) {
    console.error('Error parsing AI response:', error);
    if (typeof aiResponse === 'string') {
      console.error('AI Response preview (first 500 chars):', aiResponse.substring(0, 500));
      console.error(
        'AI Response preview (last 500 chars):',
        aiResponse.substring(Math.max(0, aiResponse.length - 500))
      );
      if (!aiResponse.trim().endsWith('}')) {
        throw new Error(
          'Resume generation was truncated before completion. Please try again (shorter job description may help).'
        );
      }
    }
    toast.error('An error occurred while parsing the AI response');
    throw error instanceof Error
      ? error
      : new Error('An error occurred while parsing the AI response');
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

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    // Common when the model hits max_tokens mid-object
    if (!jsonString.trim().endsWith('}')) {
      throw new Error(
        'Resume generation was truncated before completion. Please try again (shorter job description may help).'
      );
    }
    throw error;
  }
};
