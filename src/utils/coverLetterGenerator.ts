import { ProfileWithDetailsRPC } from '../lib/supabase';

// Using ProfileWithDetailsRPC type from supabase.ts
type Profile = ProfileWithDetailsRPC;

interface GeneratedCoverLetter {
  content: string;
  jobTitle?: string;
  companyName?: string;
}

interface GeneratedAnswer {
  content: string;
  question: string;
}

export const generateCoverLetter = async (
  profile: Profile,
  jobDescription: string,
  resumeContent: any,
  tailorCompanyNames: boolean = false
): Promise<GeneratedCoverLetter> => {
  try {
    const endpoint = tailorCompanyNames
      ? '/api/generate-cover-letter-james'
      : '/api/generate-cover-letter';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        jobDescription,
        resumeContent,
        tailorCompanyNames,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate cover letter');
    }

    const data = await response.json();
    
    return {
      content: data.content,
      jobTitle: data.jobTitle,
      companyName: data.companyName
    };
  } catch (error) {
    console.error('Error generating cover letter:', error);
    throw new Error('Failed to generate cover letter');
  }
};

export const generateAnswer = async (
  profile: Profile,
  question: string,
  jobDescription: string,
  resumeContent: any,
  tailorCompanyNames: boolean = false
): Promise<GeneratedAnswer> => {
  try {
    const endpoint = tailorCompanyNames
      ? '/api/generate-answer-james'
      : '/api/generate-answer';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        question,
        jobDescription,
        resumeContent,
        tailorCompanyNames,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate answer');
    }

    const data = await response.json();
    
    return {
      content: data.content,
      question: data.question
    };
  } catch (error) {
    console.error('Error generating answer:', error);
    throw new Error('Failed to generate answer');
  }
};
