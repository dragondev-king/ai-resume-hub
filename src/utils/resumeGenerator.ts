import OpenAI from 'openai';
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

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.REACT_APP_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

export const generateResume = async (profile: Profile, jobDescription: string): Promise<GeneratedResume> => {
  try {
    // Create a comprehensive prompt for the AI that includes job info extraction
    const prompt = createAIPrompt(profile, jobDescription);
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume writer specializing in career transitions and role-specific tailoring. Your goal is to transform a candidate\'s experience to make them appear as an ideal fit for the target position, even if their original experience doesn\'t perfectly match. Be creative and strategic in highlighting transferable skills, relevant technologies, and adaptable experience. Generate 7-12 bullet points per work experience, with varying counts based on role complexity and duration. Extract the job title and company name from the job description. CRITICAL: Aggressively tailor job titles and experience descriptions to align with the target role while maintaining authenticity and keeping company names unchanged.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000, // Increased to accommodate more bullet points
    });

    const aiResponse = completion.choices[0]?.message?.content || '';
    
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


const createAIPrompt = (profile: Profile, jobDescription: string): string => {
  return `
Please create a highly tailored resume for the following job description. The goal is to position the candidate as an ideal fit for this specific role, even if their original experience doesn't perfectly match.

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || 'Not provided'}

ORIGINAL EXPERIENCE (Use as inspiration but don't be limited by it):
${profile.experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Address: ${exp.address || 'Not provided'}
  Original Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

CRITICAL INSTRUCTIONS FOR TAILORING:
1. ANALYZE the job description thoroughly to identify:
   - Job title and company name
   - Required technical skills and technologies
   - Key responsibilities and duties
   - Industry-specific terminology
   - Desired qualifications and experience level
   - Company culture and values mentioned

2. TRANSFORM each work experience to align with the target role:
   - Adjust job titles to show progression toward the target position
   - Rewrite bullet points to emphasize relevant skills and achievements
   - Include specific technologies, tools, and methodologies mentioned in the job description
   - Focus on transferable skills that apply to the target role
   - Use industry-specific language and terminology from the job description

3. CREATIVE TAILORING APPROACH:
   - If the job requires specific technologies (e.g., Ruby on Rails), incorporate those technologies into relevant work experiences
   - Emphasize similar frameworks, methodologies, or problem-solving approaches
   - Highlight leadership, project management, and collaboration skills that are universally valuable
   - Show how past experiences demonstrate the ability to learn and adapt to new technologies
   - Create bullet points that showcase the candidate's potential to excel in the target role

4. JOB TITLE STRATEGY:
   - Most recent position: Make it closely match or be one step below the target job title
   - Previous positions: Show clear career progression toward the target role
   - Use industry-standard titles that align with the target position
   - Keep company names exactly as provided

Please provide the following in JSON format:

1. Extract the job title and company name from the job description
2. A compelling professional summary that positions the candidate for this specific role
3. Enhanced work experience with 7-12 bullet points per position that:
   - Are specifically tailored to the job description requirements
   - Include relevant technologies, tools, and methodologies from the job description
   - Show quantifiable achievements and measurable impact
   - Demonstrate transferable skills and adaptability
   - Use action verbs and industry-specific terminology from the job description
   - Vary bullet point count based on role complexity and duration
4. Enhanced skills list that includes both current skills and skills mentioned in the job description

EXAMPLE OF TAILORING:
If applying for "Ruby on Rails Developer" and original experience was in "Web Development":
- Adjust title to "Ruby on Rails Developer"
- Include bullet points about web development, database management, API development
- Emphasize experience with similar frameworks (if any) or rapid learning abilities
- Highlight problem-solving, debugging, and software development lifecycle experience, and Ruby on Rails experience

Please respond with ONLY valid JSON in this exact format:
{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Tailored Job Title",
      "company": "Company Name", 
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Tailored bullet point emphasizing relevant skills for this specific role...",
        "Bullet point highlighting transferable experience that applies to target position...",
        "Achievement that demonstrates ability to excel in the target role...",
        "Technical accomplishment using relevant technologies or methodologies...",
        "Leadership or collaboration experience valuable for the target position...",
        "Problem-solving or innovation that shows adaptability...",
        "Project management or delivery experience relevant to target role...",
        "Cross-functional collaboration demonstrating team skills...",
        "Process improvement or optimization relevant to target position...",
        "Strategic thinking or planning experience valuable for the role...",
        "Measurable outcome that demonstrates impact and results...",
        "Technical expertise or specialization relevant to target position..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}
`;
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
