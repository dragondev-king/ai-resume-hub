-- =====================================================
-- SIMPLE DATABASE SETUP - No RLS, Role in Users Table
-- =====================================================
-- This creates a simple setup without RLS policies

-- Drop existing objects first
DROP TRIGGER IF EXISTS sync_user_trigger ON auth.users;
DROP FUNCTION IF EXISTS sync_user_to_public();
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS profile_assignments CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Create user role enum
CREATE TYPE user_role AS ENUM ('bidder', 'manager', 'admin');

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
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
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
  bidder_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id, bidder_id)
);

-- Create job_applications table
CREATE TABLE job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bidder_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  job_title TEXT NOT NULL,
  company_name TEXT,
  job_description TEXT NOT NULL,
  job_description_link TEXT,
  resume_file_name TEXT,
  generated_summary TEXT,
  generated_experience JSONB,
  generated_skills TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_created_at ON profiles(created_at);

CREATE INDEX idx_profile_assignments_profile_id ON profile_assignments(profile_id);
CREATE INDEX idx_profile_assignments_bidder_id ON profile_assignments(bidder_id);
CREATE INDEX idx_profile_assignments_created_at ON profile_assignments(created_at);

CREATE INDEX idx_job_applications_profile_id ON job_applications(profile_id);
CREATE INDEX idx_job_applications_bidder_id ON job_applications(bidder_id);
CREATE INDEX idx_job_applications_created_at ON job_applications(created_at);

-- Create simple trigger function to sync users
CREATE OR REPLACE FUNCTION sync_user_to_public()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      INSERT INTO public.users (id, email, first_name, last_name, role, is_active)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        'bidder',
        true
      );
      RAISE NOTICE 'Successfully synced user % to public.users', NEW.email;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync user % to public.users: %', NEW.email, SQLERRM;
        RETURN NEW;
    END;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER sync_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_to_public();

-- Sync existing users
INSERT INTO users (id, email, first_name, last_name, role, is_active, created_at, updated_at)
SELECT 
  id,
  email,
  COALESCE(raw_user_meta_data->>'first_name', ''),
  COALESCE(raw_user_meta_data->>'last_name', ''),
  'bidder',
  true,
  created_at,
  updated_at
FROM auth.users
WHERE id NOT IN (SELECT id FROM users)
ON CONFLICT (id) DO NOTHING;

-- Set your user as admin (replace with your user ID)
-- INSERT INTO users (id, email, first_name, last_name, role, is_active) 
-- VALUES ('43339c7a-ca36-448c-a261-7c3c27c2c65b', 'dragondev1017@gmail.com', '', '', 'admin', true)
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

SELECT 'Simple database setup completed successfully!' as status; 