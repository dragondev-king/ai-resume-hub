import { ProfileWithDetailsRPC } from '../lib/supabase';
import { isSoftSkillLabel, sanitizeSkillName } from './resumeLayout';
import { assertRemoteJobDescription } from './remoteRole';

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
  hardSkills?: string[];
  softSkills?: string[];
  jobTitle?: string;
  companyName?: string;
}

export type AIProvider = 'openai' | 'claude';
export type ResumeApiVersion = 'v1' | 'v2';

/** v1 = original aggressive tailoring. v2 = ATS keywords without inventing stacks. */
export const RESUME_API_VERSION: ResumeApiVersion = 'v1';

function generateResumePath(version: ResumeApiVersion): string {
  return version === 'v2' ? '/api/v2/generate-resume' : '/api/generate-resume';
}

export const generateResume = async (
  profile: Profile,
  jobDescription: string,
  provider: AIProvider = 'openai',
  version: ResumeApiVersion = RESUME_API_VERSION
): Promise<GeneratedResume> => {
  assertRemoteJobDescription(jobDescription);

  const response = await fetch(generateResumePath(version), {
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

    const skillGroups = parseSkillPayload(parsed.skills, originalProfile.skills);

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
      skills: skillGroups.skills,
      hardSkills: skillGroups.hardSkills,
      softSkills: skillGroups.softSkills,
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

function normalizeGeneratedSkills(skills: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(skills)
    ? skills
    : typeof skills === 'string'
      ? skills.split(/,|<\/?br\s*\/?>|\n/i)
      : fallback;
  return raw.map((skill) => sanitizeSkillName(String(skill))).filter(Boolean);
}

function parseSkillPayload(
  skills: unknown,
  fallback: string[]
): { skills: string[]; hardSkills: string[]; softSkills: string[] } {
  if (skills && typeof skills === 'object' && !Array.isArray(skills)) {
    const obj = skills as Record<string, unknown>;
    const hardSkills = normalizeGeneratedSkills(obj.hard ?? obj.hardSkills, []);
    const softSkills = normalizeGeneratedSkills(obj.soft ?? obj.softSkills, []);
    if (hardSkills.length || softSkills.length) {
      return { hardSkills, softSkills, skills: [...hardSkills, ...softSkills] };
    }
  }

  const flat = normalizeGeneratedSkills(skills, fallback);
  const hardSkills: string[] = [];
  const softSkills: string[] = [];
  for (const skill of flat) {
    if (isSoftSkillLabel(skill)) softSkills.push(skill);
    else hardSkills.push(skill);
  }
  return { skills: flat, hardSkills, softSkills };
}
