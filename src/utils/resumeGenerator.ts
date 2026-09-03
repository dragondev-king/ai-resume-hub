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
    throw new Error(await readGenerationError(response));
  }

  const data = await response.json();
  if (!data?.aiResponse) {
    throw new Error('Resume generation returned no content');
  }

  return parseAIResponse(profile, data.aiResponse);
};

async function readGenerationError(response: Response): Promise<string> {
  const fallback = `Failed to generate resume (${response.status})`;
  const text = await response.text();
  try {
    const errorData = JSON.parse(text);
    return errorData.details || errorData.error || fallback;
  } catch {
    if (text.includes('FUNCTION_INVOCATION_FAILED')) {
      return 'Resume generation timed out or crashed on the server. Please try again.';
    }
    const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return stripped.slice(0, 300) || fallback;
  }
}

const parseAIResponse = (originalProfile: Profile, aiResponse: string | Record<string, unknown>): GeneratedResume => {
  try {
    const parsed =
      typeof aiResponse === 'string'
        ? parseJsonResponse(aiResponse)
        : aiResponse;

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Resume generation returned invalid content');
    }

    return {
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
  } catch (error) {
    console.error('Error parsing AI response:', error);
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

  return JSON.parse(jsonString);
};
