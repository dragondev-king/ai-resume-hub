import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  AIProvider,
  generatePlainText,
  isAIProvider,
  providerConfigError,
} from '../lib/aiClients';

interface RequestBody {
  profile: any;
  question: string;
  jobDescription: string;
  resumeContent: any;
  provider?: AIProvider;
}

const ANSWER_SYSTEM =
  "You are a professional job application consultant. Generate concise, thoughtful, specific, and compelling answers to job application questions. Your answers should be authentic, demonstrate relevant experience, and align with the candidate's background and the job requirements. Keep responses brief and direct - avoid unnecessary elaboration.";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      profile,
      question,
      jobDescription,
      resumeContent,
      provider = 'openai',
    } = req.body as RequestBody;

    if (!profile || !question || !jobDescription || !resumeContent) {
      return res.status(400).json({
        error: 'Missing required fields: profile, question, jobDescription, and resumeContent',
      });
    }

    if (!isAIProvider(provider)) {
      return res.status(400).json({ error: 'Invalid provider. Must be "openai" or "claude".' });
    }

    const configError = providerConfigError(provider);
    if (configError) {
      return res.status(500).json(configError);
    }

    const prompt = createAnswerPrompt(profile, question, jobDescription, resumeContent);
    const answerContent = await generatePlainText({
      provider,
      system: ANSWER_SYSTEM,
      prompt,
      maxTokens: 1000,
    });

    return res.status(200).json({
      success: true,
      content: answerContent,
      question,
      provider,
    });
  } catch (error: any) {
    console.error('Error generating answer:', error);
    const details = String(error?.message || error);
    const needsWorkspaceId = details.includes('anthropic-workspace-id is required');
    return res.status(500).json({
      error: 'Failed to generate answer',
      details: needsWorkspaceId
        ? 'Claude rejected the request because this API key needs a workspace. Set ANTHROPIC_WORKSPACE_ID.'
        : details,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
}

const createAnswerPrompt = (profile: any, question: string, jobDescription: string, resumeContent: any): string => {
  return `
Please provide a thoughtful answer to the following job application question:

QUESTION:
${question}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE INFORMATION:
Name: ${profile.first_name} ${profile.last_name}
Current Title: ${profile.title || ''}
Email: ${profile.email}
Location: ${profile.location || ''}

CANDIDATE'S BACKGROUND:
Summary: ${profile.summary || ''}

EXPERIENCE:
${profile.experience.map((exp: any) => `
- ${exp.position} at ${exp.company} (${exp.start_date} - ${exp.end_date})
  Description: ${exp.description || ''}
`).join('\n')}

EDUCATION:
${profile.education.map((edu: any) => `
- ${edu.degree} in ${edu.field} from ${edu.school} (${edu.start_date} - ${edu.end_date})
`).join('\n')}

SKILLS:
${profile.skills.filter((skill: string) => skill.trim()).join(', ')}

AI-GENERATED RESUME CONTENT:
Summary: ${resumeContent.summary || ''}
Enhanced Experience: ${JSON.stringify(resumeContent.experience || [], null, 2)}
Enhanced Skills: ${resumeContent.skills ? resumeContent.skills.join(', ') : ''}

Please provide an answer that:
1. Directly addresses the specific question asked
2. Uses concrete examples from the candidate's experience
3. Demonstrates relevant skills and knowledge
4. Shows enthusiasm and genuine interest
5. Aligns with the job requirements
6. Is authentic and personal to the candidate
7. Is well-structured and easy to read
8. Uses the candidate's actual background and experience
9. Maintains a professional yet conversational tone

The answer should be:
- Specific and concise
- Relevant to the question and job
- Based on the candidate's actual experience
- Professional but engaging
- Approximately 30-50 words (keep it brief and to the point)

Please write the answer in the candidate's voice, using their actual experience and background. Be direct and avoid unnecessary elaboration.
Don't use complex words like "scalability", "reliability", or "robust". Keep it simple, like how native English speakers write.
Avoid examples that are too close to the job's tech stack because it'll be obvious AI generated it.
CHRONOLOGY: Only mention technologies alongside roles whose dates overlap after that technology existed. Do not claim years of experience with a version that did not exist yet. Follow the dates on the AI-generated resume content.
`;
};
