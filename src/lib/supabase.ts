import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client with service role key for user management
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// User role enum
export type UserRole = 'bidder' | 'manager' | 'admin';

// Database types
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  title?: string;
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
  status: 'active' | 'rejected' | 'withdrawn';
  rejected_at?: string;
  withdrawn_at?: string;
  created_at: string;
}

export interface Experience {
  id?: string;
  company: string;
  position: string;
  start_date: string;
  end_date: string;
  current?: boolean;
  description?: string; // Keep for backward compatibility
  descriptions?: string[]; // Array of bullet points (for AI-generated content)
  achievements?: string[]; // Legacy field, use descriptions instead
  address?: string; // Company address
}

export interface Education {
  id?: string;
  school: string; // Alternative field name for resume generation
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
  current?: boolean;
  gpa?: string;
}

// Extended types for UI
export interface ProfileWithAssignments extends Profile {
  assignments?: ProfileAssignment[];
  applications?: JobApplication[];
}

export interface JobApplicationWithDetails extends JobApplication {
  updated_at: string;
  profile_first_name?: string;
  profile_last_name?: string;
  profile_email?: string;
  bidder_first_name?: string;
  bidder_last_name?: string;
  bidder_email?: string;
}

// Simple bidder type for filter dropdowns
export interface Bidder {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
}

// =====================================================
// RPC FUNCTION RETURN TYPES
// =====================================================

// Job Applications RPC Types
export interface JobApplicationRPC {
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
  status: 'active' | 'rejected' | 'withdrawn';
  rejected_at?: string;
  withdrawn_at?: string;
  created_at: string;
  profile_first_name?: string;
  profile_last_name?: string;
  profile_email?: string;
  bidder_first_name?: string;
  bidder_last_name?: string;
  bidder_email?: string;
}

export interface ProfileRPC {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

export interface BidderRPC {
  id: string;
  first_name?: string;
  last_name?: string;
  email: string;
}

// User Management RPC Types
export interface UserRPC {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Profile Management RPC Types
export interface ProfileWithDetailsRPC {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  title?: string;
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
  owner_id: string;
  owner_email: string;
  owner_first_name?: string;
  owner_last_name?: string;
  owner_role: UserRole;
  assigned_bidders: Array<{
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  }>;
}

export interface ProfileForResumeRPC {
  id: string;
  first_name: string;
  last_name: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
}

// Profile Assignment RPC Types
export interface ProfileAssignmentRPC {
  id: string;
  profile_id: string;
  bidder_id: string;
  assigned_by: string;
  created_at: string;
  profile_first_name: string;
  profile_last_name: string;
  profile_email: string;
  bidder_first_name?: string;
  bidder_last_name?: string;
  bidder_email: string;
  assigned_by_first_name?: string;
  assigned_by_last_name?: string;
} 