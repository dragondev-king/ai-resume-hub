-- =====================================================
-- 03. CREATE TABLES - SIMPLE SETUP
-- =====================================================
-- This creates all tables without RLS policies

-- Create users table with role field
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role user_role DEFAULT 'bidder',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  linkedin TEXT,
  portfolio TEXT,
  summary TEXT,
  experience JSONB DEFAULT '[]',
  education JSONB DEFAULT '[]',
  skills TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profile_assignments table
CREATE TABLE profile_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bidder_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id, bidder_id)
);

-- Create job_applications table
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bidder_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_title TEXT,
  company_name TEXT,
  job_description TEXT,
  job_description_link TEXT,
  resume_file_name TEXT,
  generated_summary TEXT,
  generated_experience JSONB,
  generated_skills TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

SELECT 'Tables created successfully!' as status; 