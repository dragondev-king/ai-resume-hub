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
  resumeContent: any
): Promise<GeneratedCoverLetter> => {
  try {
    // Call the Vercel serverless function instead of OpenAI directly
    const response = await fetch('/api/generate-cover-letter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        jobDescription,
        resumeContent,
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
  resumeContent: any
): Promise<GeneratedAnswer> => {
  try {
    // Call the Vercel serverless function instead of OpenAI directly
    const response = await fetch('/api/generate-answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        question,
        jobDescription,
        resumeContent,
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
