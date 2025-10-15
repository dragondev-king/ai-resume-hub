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

export const generateResume = async (profile: Profile, jobDescription: string): Promise<GeneratedResume> => {
  try {
    // Call the Vercel serverless function instead of OpenAI directly
    const response = await fetch('/api/generate-resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        profile,
        jobDescription,
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
      jobTitle: 'Not specified',
      companyName: 'Not specified'
    };
  }
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
        descriptions: exp.description ? [exp.description] : [],
        address: exp.address
      })),
      skills: parsed.skills || originalProfile.skills,
      jobTitle: parsed.jobTitle || 'Not specified',
      companyName: parsed.companyName || 'Not specified'
    };

    // Ensure each experience has 7-12 descriptions with varying counts
    enhancedData.experience = enhancedData.experience.map((exp, index) => {
      if (!exp.descriptions || exp.descriptions.length < 7) {
        // Generate varying number of bullet points based on company index (7-12 range)
        const baseCount = 7;
        const variation = (index % 6); // Creates variation: 7, 8, 9, 10, 11, 12, 7, 8, 9...
        const targetCount = baseCount + variation;
        
        // If AI didn't provide enough descriptions, use original and pad with enhanced ones
        const originalDesc = exp.descriptions?.[0] || 'Contributed to team success and project delivery.';
        
        const enhancedDescriptions = [
          originalDesc,
          'Collaborated with cross-functional teams to deliver high-quality solutions.',
          'Demonstrated strong problem-solving skills and attention to detail.',
          'Maintained excellent communication with stakeholders and team members.',
          'Contributed to process improvements and best practices implementation.',
          'Led initiatives that resulted in measurable improvements to team productivity.',
          'Developed and implemented innovative solutions to complex technical challenges.',
          'Mentored junior team members and facilitated knowledge sharing across the organization.',
          'Established and maintained strong relationships with key stakeholders and clients.',
          'Analyzed data and provided insights that drove strategic decision-making.',
          'Optimized workflows and procedures to increase efficiency and reduce costs.',
          'Coordinated with multiple departments to ensure seamless project delivery.',
          'Created comprehensive documentation and training materials for team processes.',
          'Participated in strategic planning sessions and contributed to long-term vision.',
          'Delivered presentations to senior leadership on project progress and outcomes.',
          'Implemented quality assurance processes that improved overall project success rates.',
          'Facilitated cross-team collaboration and knowledge transfer initiatives.',
          'Streamlined operational procedures resulting in improved team efficiency.',
          'Provided technical guidance and mentorship to junior team members.',
          'Managed stakeholder expectations and ensured project deliverables met requirements.'
        ];
        
        return {
          ...exp,
          descriptions: enhancedDescriptions.slice(0, targetCount),
          address: exp.address
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
        descriptions: exp.description ? [exp.description] : [],
        address: exp.address
      })),
      skills: originalProfile.skills,
    };
  }
};
