import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  created_at: string;
  updated_at: string;
}

export interface Experience {
  id?: string;
  company: string;
  position: string;
  start_date: string;
  end_date: string;
  current: boolean;
  description: string;
  achievements: string[];
}

export interface Education {
  id?: string;
  institution: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  current: boolean;
  gpa?: string;
} 