-- =====================================================
-- AI Resume Generator - Complete Database Schema
-- =====================================================
-- This file contains the complete database setup for the AI Resume Generator application
-- Run this entire script in your Supabase SQL Editor

-- =====================================================
-- 1. CREATE ENUMS AND TABLES
-- =====================================================

-- Create user roles enum
CREATE TYPE user_role AS ENUM ('bidder', 'manager', 'admin');

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT NOT NULL,
  linkedin TEXT,
  portfolio TEXT,
  summary TEXT,
  experience JSONB DEFAULT '[]'::jsonb,
  education JSONB DEFAULT '[]'::jsonb,
  skills TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table to manage user roles
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  role user_role NOT NULL DEFAULT 'bidder',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profile_assignments table to manage which bidders can access which profiles
CREATE TABLE IF NOT EXISTS profile_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bidder_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assigned_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(profile_id, bidder_id)
);

-- Create job_applications table to track all resume generations
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  bidder_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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

-- =====================================================
-- 2. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profile_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. DROP EXISTING POLICIES (if any)
-- =====================================================

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Users can view their own profiles" ON profiles;
DROP POLICY IF EXISTS "Managers can view profiles they own" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert their own profiles" ON profiles;
DROP POLICY IF EXISTS "Managers can insert profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profiles" ON profiles;
DROP POLICY IF EXISTS "Managers can update their profiles" ON profiles;
DROP POLICY IF EXISTS "Users can delete their own profiles" ON profiles;
DROP POLICY IF EXISTS "Managers can delete their profiles" ON profiles;

DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Allow authenticated users to view roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;

DROP POLICY IF EXISTS "Bidders can view their assignments" ON profile_assignments;
DROP POLICY IF EXISTS "Managers can view assignments for their profiles" ON profile_assignments;
DROP POLICY IF EXISTS "Admins can view all assignments" ON profile_assignments;
DROP POLICY IF EXISTS "Managers can assign profiles to bidders" ON profile_assignments;
DROP POLICY IF EXISTS "Admins can assign profiles" ON profile_assignments;
DROP POLICY IF EXISTS "Managers can delete assignments for their profiles" ON profile_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON profile_assignments;

DROP POLICY IF EXISTS "Bidders can view their own applications" ON job_applications;
DROP POLICY IF EXISTS "Managers can view applications for their profiles" ON job_applications;
DROP POLICY IF EXISTS "Admins can view all applications" ON job_applications;
DROP POLICY IF EXISTS "Bidders can insert their own applications" ON job_applications;
DROP POLICY IF EXISTS "Admins can insert applications" ON job_applications;

-- =====================================================
-- 4. CREATE POLICIES
-- =====================================================

-- Profiles policies
CREATE POLICY "Users can view their own profiles" ON profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Managers can view profiles they own" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'manager'
    ) AND user_id = auth.uid()
  );

CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can insert their own profiles" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Managers can insert profiles" ON profiles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'manager'
    ) AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their own profiles" ON profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Managers can update their profiles" ON profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'manager'
    ) AND user_id = auth.uid()
  );

CREATE POLICY "Users can delete their own profiles" ON profiles
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Managers can delete their profiles" ON profiles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'manager'
    ) AND user_id = auth.uid()
  );

-- User roles policies (fixed to avoid infinite recursion)
CREATE POLICY "Users can view their own role" ON user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- Allow all authenticated users to view roles (needed for role checking)
CREATE POLICY "Allow authenticated users to view roles" ON user_roles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admins can manage roles (insert, update, delete)
CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Profile assignments policies
CREATE POLICY "Bidders can view their assignments" ON profile_assignments
  FOR SELECT USING (bidder_id = auth.uid());

CREATE POLICY "Managers can view assignments for their profiles" ON profile_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.user_id
      WHERE p.id = profile_assignments.profile_id 
      AND ur.user_id = auth.uid() 
      AND ur.role = 'manager'
    )
  );

CREATE POLICY "Admins can view all assignments" ON profile_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Managers can assign profiles to bidders" ON profile_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.user_id
      WHERE p.id = profile_assignments.profile_id 
      AND ur.user_id = auth.uid() 
      AND ur.role = 'manager'
    ) AND assigned_by = auth.uid()
  );

CREATE POLICY "Admins can assign profiles" ON profile_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Managers can delete assignments for their profiles" ON profile_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.user_id
      WHERE p.id = profile_assignments.profile_id 
      AND ur.user_id = auth.uid() 
      AND ur.role = 'manager'
    )
  );

CREATE POLICY "Admins can delete assignments" ON profile_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Job applications policies
CREATE POLICY "Bidders can view their own applications" ON job_applications
  FOR SELECT USING (bidder_id = auth.uid());

CREATE POLICY "Managers can view applications for their profiles" ON job_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.user_id
      WHERE p.id = job_applications.profile_id 
      AND ur.user_id = auth.uid() 
      AND ur.role = 'manager'
    )
  );

CREATE POLICY "Admins can view all applications" ON job_applications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Bidders can insert their own applications" ON job_applications
  FOR INSERT WITH CHECK (bidder_id = auth.uid());

CREATE POLICY "Admins can insert applications" ON job_applications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 5. CREATE INDEXES FOR BETTER PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_created_at ON profiles(created_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_profile_assignments_profile_id ON profile_assignments(profile_id);
CREATE INDEX IF NOT EXISTS idx_profile_assignments_bidder_id ON profile_assignments(bidder_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_profile_id ON job_applications(profile_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_bidder_id ON job_applications(bidder_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_created_at ON job_applications(created_at);

-- =====================================================
-- 6. CREATE FUNCTIONS AND TRIGGERS
-- =====================================================

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create function to ensure all users have a role
CREATE OR REPLACE FUNCTION ensure_user_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user already has a role
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = NEW.id) THEN
    -- Insert default bidder role
    INSERT INTO user_roles (user_id, role) VALUES (NEW.id, 'bidder');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get user role
CREATE OR REPLACE FUNCTION get_user_role(user_uuid UUID)
RETURNS user_role AS $$
BEGIN
  RETURN (
    SELECT role FROM user_roles 
    WHERE user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to check if user can access profile
CREATE OR REPLACE FUNCTION can_access_profile(profile_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    -- User owns the profile
    EXISTS (SELECT 1 FROM profiles WHERE id = profile_uuid AND user_id = user_uuid)
    OR
    -- User is assigned to the profile
    EXISTS (SELECT 1 FROM profile_assignments WHERE profile_id = profile_uuid AND bidder_id = user_uuid)
    OR
    -- User is admin
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = user_uuid AND role = 'admin')
    OR
    -- User is manager and owns the profile
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.user_id
      WHERE p.id = profile_uuid 
      AND ur.user_id = user_uuid 
      AND ur.role = 'manager'
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 7. CREATE TRIGGERS
-- =====================================================

-- Create triggers to automatically update updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger to automatically assign role to new users
DROP TRIGGER IF EXISTS ensure_user_role_trigger ON auth.users;
CREATE TRIGGER ensure_user_role_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION ensure_user_role();

-- =====================================================
-- 8. ENSURE EXISTING USERS HAVE ROLES
-- =====================================================

-- Ensure existing users have roles
INSERT INTO user_roles (user_id, role)
SELECT id, 'bidder'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_roles)
ON CONFLICT (user_id) DO NOTHING;

-- =====================================================
-- 9. CREATE INITIAL ADMIN USER (OPTIONAL)
-- =====================================================
-- Uncomment and modify the following lines to create an initial admin user
-- Replace 'your-admin-email@example.com' with the actual admin email

/*
-- Create admin role for existing user (replace with actual user ID)
UPDATE user_roles 
SET role = 'admin' 
WHERE user_id = (
  SELECT id FROM auth.users 
  WHERE email = 'your-admin-email@example.com'
);
*/

-- =====================================================
-- COMPLETION MESSAGE
-- =====================================================

-- This will show a success message in the SQL editor
SELECT 'Database schema setup completed successfully!' as status; 