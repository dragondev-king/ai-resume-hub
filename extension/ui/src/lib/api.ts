import type { Profile } from './supabase';
import type { ExtensionSettings } from './settings';
import { mostRecentIndices } from './careerProgression';

export type GeneratedResume = {
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
};

type CompanyReplacement = { company: string; address: string };

function asBooleanFlag(value: unknown): boolean {
  return value === true || value === 'true';
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

export function getTailorCompanyNamesForProfile(profile: Profile | null | undefined): boolean {
  return asBooleanFlag(parseMetadata(profile?.metadata).tailorCompanyNames);
}

function normalizeDescriptions(exp: any): string[] {
  if (!exp || typeof exp !== 'object') return [];
  if (Array.isArray(exp.descriptions)) {
    return exp.descriptions.map((d: unknown) => String(d || '').trim()).filter(Boolean);
  }
  if (typeof exp.description === 'string' && exp.description.trim()) {
    return [exp.description.trim()];
  }
  return [];
}

function parseJsonResponse(aiResponse: string | Record<string, unknown>): any {
  if (typeof aiResponse !== 'string') return aiResponse;
  let text = aiResponse.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON found in AI response');
  return JSON.parse(match[0]);
}

function parseAIResponse(
  profile: Profile,
  aiResponse: string | Record<string, unknown>,
  tailorCompanyNames: boolean,
  replacements: CompanyReplacement[] = []
): GeneratedResume {
  const parsed = parseJsonResponse(aiResponse);
  const aiExperience = Array.isArray(parsed.experience) ? parsed.experience : [];
  const original = profile.experience || [];
  const rowCount = Math.max(aiExperience.length, original.length);
  const experience: GeneratedResume['experience'] = [];

  if (!tailorCompanyNames) {
    for (let i = 0; i < rowCount; i++) {
      const aiExp = aiExperience[i] || {};
      const orig = original[i] || {};
      const descriptions = normalizeDescriptions(aiExp);
      const fallback = normalizeDescriptions(orig);
      experience.push({
        position: orig.position || aiExp.position || '',
        company: orig.company || aiExp.company || '',
        start_date: orig.start_date || aiExp.start_date || '',
        end_date: orig.end_date || aiExp.end_date || '',
        address: orig.address || aiExp.address || '',
        descriptions: descriptions.length ? descriptions : fallback,
      });
    }
  } else {
    const dateSource = (original.length ? original : aiExperience).slice(0, rowCount);
    const recentOrdered = mostRecentIndices(dateSource, 2);
    const recentIdx = new Set(recentOrdered);

    for (let i = 0; i < rowCount; i++) {
      const aiExp = aiExperience[i] || {};
      const orig = original[i] || {};
      const isRecentForCompany = recentIdx.has(i);
      const replacementForIndex = isRecentForCompany
        ? replacements[recentOrdered.indexOf(i)]
        : undefined;
      const descriptions = normalizeDescriptions(aiExp);
      const fallback = normalizeDescriptions(orig);

      experience.push({
        position: aiExp.position || orig.position || '',
        company: isRecentForCompany
          ? replacementForIndex?.company || aiExp.company || orig.company || ''
          : orig.company || aiExp.company || '',
        start_date: orig.start_date || aiExp.start_date || '',
        end_date: orig.end_date || aiExp.end_date || '',
        address: isRecentForCompany
          ? replacementForIndex?.address || aiExp.address || orig.address || ''
          : orig.address || aiExp.address || '',
        descriptions: descriptions.length ? descriptions : fallback,
      });
    }
  }

  return {
    summary: parsed.summary || profile.summary || '',
    experience,
    skills: Array.isArray(parsed.skills) ? parsed.skills.map(String) : profile.skills || [],
    jobTitle: typeof parsed.jobTitle === 'string' ? parsed.jobTitle.trim() : '',
    companyName: typeof parsed.companyName === 'string' ? parsed.companyName.trim() : '',
  };
}

async function apiFetchJson(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: any }> {
  const proxy = await chrome.runtime.sendMessage({
    type: 'API_FETCH',
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!proxy?.ok) {
    throw new Error(proxy?.error || 'Extension background request failed');
  }

  return {
    ok: Boolean(proxy.result?.ok),
    status: proxy.result?.status || 0,
    data: proxy.result?.data,
  };
}

export async function generateResume(
  settings: ExtensionSettings,
  profile: Profile,
  jobDescription: string,
  provider: 'openai' | 'claude' = 'openai'
): Promise<GeneratedResume> {
  const tailorCompanyNames = getTailorCompanyNamesForProfile(profile);
  const path = tailorCompanyNames ? '/api/generate-resume-james' : '/api/generate-resume';
  const url = `${settings.apiBaseUrl}${path}`;

  // Ensure metadata is a plain object so the API can read tailorCompanyNames
  const profilePayload = {
    ...profile,
    metadata: {
      ...parseMetadata(profile.metadata),
      tailorCompanyNames,
    },
  };

  const { ok, status, data } = await apiFetchJson(url, {
    profile: profilePayload,
    jobDescription,
    provider,
    tailorCompanyNames,
  });

  if (!ok) {
    const message =
      data?.details ||
      data?.error ||
      data?.detail ||
      (typeof data?.raw === 'string' ? data.raw.slice(0, 180) : null) ||
      `Failed to generate resume (HTTP ${status})`;
    throw new Error(
      status === 405
        ? `${message}. API base URL is wrong — use https://ai-talent-resume-hub.vercel.app`
        : message
    );
  }

  if (!data?.aiResponse) throw new Error('Empty AI response from server');

  const replacements: CompanyReplacement[] = Array.isArray(data.companyPick?.replacements)
    ? data.companyPick.replacements
        .map((r: any) => ({
          company: String(r?.company || '').trim(),
          address: String(r?.address || '').trim(),
        }))
        .filter((r: CompanyReplacement) => r.company)
    : [];

  if (tailorCompanyNames && replacements.length === 0) {
    console.warn(
      '[AI Resume Hub] tailorCompanyNames is on but API returned no companyPick.replacements. Is the deployed API up to date with company-tailoring?'
    );
  }

  return parseAIResponse(profile, data.aiResponse, tailorCompanyNames, replacements);
}

export async function generateAnswer(
  settings: ExtensionSettings,
  profile: Profile,
  question: string,
  jobDescription: string,
  resumeContent: GeneratedResume
): Promise<{ content: string; question: string }> {
  const url = `${settings.apiBaseUrl}/api/generate-answer`;
  const { ok, status, data } = await apiFetchJson(url, {
    profile,
    question,
    jobDescription,
    resumeContent,
    tailorCompanyNames: getTailorCompanyNamesForProfile(profile),
  });

  if (!ok) {
    throw new Error(
      data?.details || data?.error || `Failed to generate answer (HTTP ${status})`
    );
  }

  return {
    content: String(data?.content || ''),
    question: String(data?.question || question),
  };
}

export async function extractFromActiveTab(): Promise<{
  jobDescription: string;
  jobDescriptionLink: string;
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found.');

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const selection = window.getSelection()?.toString()?.trim() || '';
      if (selection.length > 80) {
        return { jobDescription: selection, jobDescriptionLink: location.href };
      }
      const selectors = [
        '[data-testid="jobDescriptionText"]',
        '.jobs-description__content',
        '.jobs-description-content__text',
        '#jobDescriptionText',
        '.jobsearch-JobComponent-description',
        '[class*="job-description"]',
        '[class*="JobDescription"]',
        'article',
        'main',
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        const text = el?.innerText?.trim() || '';
        if (text.length > 200) {
          return { jobDescription: text.slice(0, 50000), jobDescriptionLink: location.href };
        }
      }
      const bodyText = document.body?.innerText?.trim() || '';
      return {
        jobDescription: bodyText.slice(0, 50000),
        jobDescriptionLink: location.href,
      };
    },
  });

  const payload = results?.[0]?.result as
    | { jobDescription?: string; jobDescriptionLink?: string }
    | undefined;
  if (!payload?.jobDescription?.trim()) {
    throw new Error('Could not read job text. Select the description, then try again.');
  }
  return {
    jobDescription: payload.jobDescription.trim(),
    jobDescriptionLink: (payload.jobDescriptionLink || tab.url || '').trim(),
  };
}
