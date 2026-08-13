import toast from 'react-hot-toast';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { applyCareerTitleProgression, mostRecentIndices } from './careerProgression';

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

/** Normalize messy AI/profile description fields into a bullet array. */
export function normalizeDescriptions(exp: any): string[] {
  if (!exp || typeof exp !== 'object') return [];

  const fromArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && typeof (item as any).text === 'string') {
          return String((item as any).text).trim();
        }
        return '';
      })
      .filter(Boolean);
  };

  const fromDescriptions = fromArray(exp.descriptions);
  if (fromDescriptions.length) return fromDescriptions;

  const fromBullets = fromArray(exp.bullets);
  if (fromBullets.length) return fromBullets;

  const fromAchievements = fromArray(exp.achievements);
  if (fromAchievements.length) return fromAchievements;

  if (typeof exp.description === 'string' && exp.description.trim()) {
    const text = exp.description.trim();
    const lines = text
      .split(/\n+/)
      .map((line: string) => line.replace(/^\s*[-•*]\s*/, '').trim())
      .filter(Boolean);
    return lines.length > 1 ? lines : [text];
  }

  if (Array.isArray(exp.description)) {
    return fromArray(exp.description);
  }

  return [];
}

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

    const aiExperience = Array.isArray(parsed.experience)
      ? (parsed.experience as any[])
      : [];
    const originalExperience = originalProfile.experience || [];

    if (!aiExperience.length && !originalExperience.length) {
      throw new Error('AI response did not include any experience entries');
    }

    const rowCount = Math.max(aiExperience.length, originalExperience.length);
    const experience: GeneratedResume['experience'] = [];

    const dateSource = (originalExperience.length ? originalExperience : aiExperience).slice(
      0,
      rowCount
    );
    // Two most recent roles by date — only those get company name swaps
    const recentOrdered = mostRecentIndices(dateSource, 2);
    const recentIdx = new Set(recentOrdered);

    for (let index = 0; index < rowCount; index++) {
      const original = originalExperience[index];
      const aiExp = aiExperience[index] || {};
      const isRecentForCompany = tailorCompanyNames && recentIdx.has(index);
      const replacementForIndex = isRecentForCompany
        ? replacements[recentOrdered.indexOf(index)]
        : undefined;

      const descriptions = normalizeDescriptions(aiExp);
      const fallbackDescriptions = normalizeDescriptions(original);

      experience.push({
        // Positions from AI when tailor is on; career ladder applied to ALL roles below
        position: tailorCompanyNames
          ? aiExp.position || original?.position || ''
          : original?.position || aiExp.position || '',
        company: isRecentForCompany
          ? replacementForIndex?.company || aiExp.company || original?.company || ''
          : tailorCompanyNames
            ? original?.company || aiExp.company || ''
            : original?.company || aiExp.company || '',
        start_date: original?.start_date || aiExp.start_date || '',
        end_date: original?.end_date || aiExp.end_date || '',
        address: isRecentForCompany
          ? replacementForIndex?.address || aiExp.address || original?.address || ''
          : tailorCompanyNames
            ? original?.address || aiExp.address || ''
            : original?.address || aiExp.address || '',
        descriptions: descriptions.length ? descriptions : fallbackDescriptions,
      });
    }

    const missingBullets = experience.filter((exp) => !exp.descriptions.length).length;
    if (missingBullets === experience.length && experience.length > 0) {
      throw new Error(
        'Resume was generated without experience bullet points. Please try again.'
      );
    }

    const jobTitle = (parsed.jobTitle as string) || '';

    // Junior (oldest company) → Senior (newest company) for EVERY role
    const finalExperience = tailorCompanyNames
      ? applyCareerTitleProgression(experience, jobTitle)
      : experience;

    const enhancedData: GeneratedResume = {
      summary: (parsed.summary as string) || originalProfile.summary || '',
      experience: finalExperience,
      skills: (parsed.skills as string[]) || originalProfile.skills || [],
      jobTitle,
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
        throw new Error('Resume generation was truncated before completion. Please try again.');
      }
    }
    toast.error(
      error instanceof Error ? error.message : 'An error occurred while parsing the AI response'
    );
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
