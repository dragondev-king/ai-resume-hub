import toast from 'react-hot-toast';
import { ProfileWithDetailsRPC } from '../lib/supabase';

type Profile = ProfileWithDetailsRPC;

interface GeneratedResume {
  summary: string;
  experience: {
    position: string;
    company: string;
    start_date: string;
    end_date: string;
    descriptions: string[];
    address?: string;
  }[];
  skills: string[];
  jobTitle?: string;
  companyName?: string;
}

export type AIProvider = 'openai' | 'claude';

type CompanyReplacement = { company: string; address: string };

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
  const replacements: CompanyReplacement[] = Array.isArray(data.companyPick?.replacements)
    ? data.companyPick.replacements
    : [];

  if (!aiResponse || (typeof aiResponse === 'string' && !aiResponse.trim())) {
    throw new Error('The AI returned an empty resume response. Please try again.');
  }

  return parseAIResponse(profile, aiResponse, tailorCompanyNames, replacements);
};

const parseAIResponse = (
  originalProfile: Profile,
  aiResponse: string | Record<string, unknown>,
  tailorCompanyNames: boolean = false,
  replacements: CompanyReplacement[] = []
): GeneratedResume => {
  try {
    const parsed =
      typeof aiResponse === 'string' ? parseJsonResponse(aiResponse) : aiResponse;

    console.log(parsed, '=== parsed');

    if (!Array.isArray(parsed.experience) || parsed.experience.length === 0) {
      throw new Error('AI response did not include any experience entries');
    }

    const aiExperience = parsed.experience as GeneratedResume['experience'];
    const originalExperience = originalProfile.experience || [];

    let experience: GeneratedResume['experience'];

    if (tailorCompanyNames) {
      experience = aiExperience.map((aiExp, index) => {
        const original = originalExperience[index];
        const replacement = replacements[index];
        return {
          position: aiExp.position || original?.position || '',
          // Prefer researched replacement companies for the first two roles
          company: replacement?.company || aiExp.company || original?.company || '',
          start_date: aiExp.start_date || original?.start_date || '',
          end_date: aiExp.end_date || original?.end_date || '',
          address: replacement?.address || aiExp.address || original?.address || '',
          descriptions: Array.isArray(aiExp.descriptions)
            ? aiExp.descriptions.filter((d) => typeof d === 'string' && d.trim())
            : [],
        };
      });
    } else {
      experience = originalExperience.map((exp, index) => {
        const aiExp = aiExperience[index];
        return {
          position: exp.position,
          company: exp.company,
          start_date: exp.start_date,
          end_date: exp.end_date,
          address: exp.address,
          descriptions: aiExp?.descriptions?.length
            ? aiExp.descriptions.filter((d) => typeof d === 'string' && d.trim())
            : exp.description
              ? [exp.description]
              : [],
        };
      });
    }

    // If AI returned fewer rows than the profile, pad from profile so the UI is never blank
    if (experience.length < originalExperience.length) {
      for (let i = experience.length; i < originalExperience.length; i++) {
        const exp = originalExperience[i];
        experience.push({
          position: exp.position,
          company: exp.company,
          start_date: exp.start_date,
          end_date: exp.end_date,
          address: exp.address,
          descriptions: exp.description ? [exp.description] : [],
        });
      }
    }

    if (!experience.length) {
      throw new Error('Parsed resume has no experience entries');
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
          'Resume generation was truncated before completion. Please try again.'
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
    if (!jsonString.trim().endsWith('}')) {
      throw new Error('Resume generation was truncated before completion. Please try again.');
    }
    throw error;
  }
};
