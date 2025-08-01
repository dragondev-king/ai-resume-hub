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
          content: 'You are a professional resume writer and career coach. Generate high-quality, specific, and impactful resume content that highlights achievements and quantifiable results. Generate 7-12 bullet points per work experience, with varying counts between different companies based on the role complexity and duration. Also extract the job title and company name from the job description. IMPORTANT: Adjust job titles in work experience to better align with the target job description while keeping company names unchanged.'
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
        descriptions: exp.description ? [exp.description] : []
      })),
      skills: profile.skills,
      jobTitle: 'Not specified',
      companyName: 'Not specified'
    };
  }
};


const createAIPrompt = (profile: Profile, jobDescription: string): string => {
  return `
Please enhance this resume for the following job description:

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || 'Not provided'}

EXPERIENCE:
${profile.experience.map(exp => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Current Description: ${exp.description || 'No description provided'}
`).join('\n')}

EDUCATION:
${profile.education.map(edu => `
- ${edu.degree} in ${edu.field} from ${edu.institution} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

CURRENT SKILLS:
${profile.skills.filter(skill => skill.trim()).join(', ')}

Please provide the following enhancements in JSON format:

1. Extract the job title and company name from the job description (if not clearly stated, make your best educated guess based on context)
2. A compelling professional summary (3 sentences)
3. Enhanced work experience with 7-12 bullet points per position that:
   - Reference the original work experience
   - Include specific achievements and quantifiable results
   - Use action verbs and industry-specific terminology
   - Align with the job description requirements
   - Vary the number of bullet points between companies (7-12 bullets per company)
   - Consider role complexity and duration when determining bullet point count
   - IMPORTANT: Adjust job titles to better match the target job description while keeping company names unchanged
   - For the most recent position, make the job title closely match the target job title from the description
   - For older positions, adjust titles to show progression toward the target role
4. Enhanced skills list that includes relevant technical and soft skills

IMPORTANT REQUIREMENTS:
- Generate 7-12 bullet points for each work experience
- Vary the number of bullet points between different companies based on:
  * Role complexity and responsibility level
  * Duration of employment
  * Impact and achievements in each role
- Each bullet point should be a complete sentence starting with an action verb
- Include specific metrics, percentages, or quantifiable results where possible
- Reference the original work experience but enhance it significantly
- Make bullet points specific and impactful
- Use industry-standard terminology
- Ensure bullet points are unique and don't repeat similar achievements
- JOB TITLE ADJUSTMENT: Modify job titles to better align with the target position:
  * For the most recent position: Make the title closely match the target job title
  * For older positions: Show career progression toward the target role
  * Keep company names exactly as they were in the original experience
  * Example: If applying for "Senior Software Engineer" and current title is "Developer", adjust to "Software Engineer" or "Senior Developer"
  * Example: If applying for "Product Manager" and previous title was "Business Analyst", adjust to "Associate Product Manager" or "Product Analyst"

Please respond with ONLY valid JSON in this exact format:
{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary here...",
  "experience": [
    {
      "position": "Job Title",
      "company": "Company Name", 
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "location": "City, State",
      "descriptions": [
        "First bullet point with specific achievement...",
        "Second bullet point with quantifiable result...",
        "Third bullet point highlighting key responsibility...",
        "Fourth bullet point showing impact...",
        "Fifth bullet point demonstrating leadership or innovation...",
        "Sixth bullet point with technical accomplishment...",
        "Seventh bullet point showing business impact...",
        "Eighth bullet point highlighting collaboration...",
        "Ninth bullet point with process improvement...",
        "Tenth bullet point showing strategic thinking...",
        "Eleventh bullet point with measurable outcome...",
        "Twelfth bullet point demonstrating expertise..."
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
        descriptions: exp.description ? [exp.description] : []
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
          descriptions: enhancedDescriptions.slice(0, targetCount)
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
        descriptions: exp.description ? [exp.description] : []
      })),
      skills: originalProfile.skills,
    };
  }
};
