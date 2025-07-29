import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// User role enum
export type UserRole = 'bidder' | 'manager' | 'admin';

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

export interface UserRoleRecord {
  id: string;
  user_id: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface ProfileAssignment {
  id: string;
  profile_id: string;
  bidder_id: string;
  assigned_by: string;
  created_at: string;
}

export interface JobApplication {
  id: string;
  profile_id: string;
  bidder_id: string;
  job_title: string;
  company_name?: string;
  job_description: string;
  job_description_link?: string;
  resume_file_name?: string;
  generated_summary?: string;
  generated_experience?: Experience[];
  generated_skills?: string[];
  created_at: string;
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

// Extended types for UI
export interface ProfileWithAssignments extends Profile {
  assignments?: ProfileAssignment[];
  applications?: JobApplication[];
}

export interface JobApplicationWithDetails extends JobApplication {
  profile?: Profile;
  bidder?: {
    id: string;
    email: string;
  };
} 