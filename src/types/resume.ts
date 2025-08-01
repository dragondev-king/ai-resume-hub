import { Experience, Education } from '../lib/supabase';

export interface ResumeData {
  first_name: string;
  last_name: string;
  title?: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
}

// Re-export the interfaces for convenience
export type { Experience, Education }; 