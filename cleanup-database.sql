-- =====================================================
-- AI Resume Generator - Database Cleanup Script
-- =====================================================
-- This script removes all existing database objects before creating new ones
-- WARNING: This will delete ALL data in the related tables!
-- Run this script in your Supabase SQL Editor BEFORE running the main schema

-- =====================================================
-- 1. DROP ALL TRIGGERS (with error handling)
-- =====================================================

-- Drop triggers on job_applications table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
        DROP TRIGGER IF EXISTS update_job_applications_updated_at ON job_applications;
    END IF;
END $$;

-- Drop triggers on profile_assignments table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_assignments') THEN
        DROP TRIGGER IF EXISTS update_profile_assignments_updated_at ON profile_assignments;
    END IF;
END $$;

-- Drop triggers on user_roles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
        DROP TRIGGER IF EXISTS update_user_roles_updated_at ON user_roles;
    END IF;
END $$;

-- Drop trigger on auth.users (always exists)
DROP TRIGGER IF EXISTS ensure_user_role_trigger ON auth.users;

-- Drop triggers on profiles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
    END IF;
END $$;

-- =====================================================
-- 2. DROP ALL FUNCTIONS
-- =====================================================

-- Drop custom functions (these will fail gracefully if they don't exist)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS ensure_user_role() CASCADE;
DROP FUNCTION IF EXISTS get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS can_access_profile(UUID, UUID) CASCADE;

-- =====================================================
-- 3. DROP ALL POLICIES (with error handling)
-- =====================================================

-- Drop policies on job_applications table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
        DROP POLICY IF EXISTS "Bidders can view their own applications" ON job_applications;
        DROP POLICY IF EXISTS "Managers can view applications for their profiles" ON job_applications;
        DROP POLICY IF EXISTS "Admins can view all applications" ON job_applications;
        DROP POLICY IF EXISTS "Bidders can insert their own applications" ON job_applications;
        DROP POLICY IF EXISTS "Admins can insert applications" ON job_applications;
    END IF;
END $$;

-- Drop policies on profile_assignments table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_assignments') THEN
        DROP POLICY IF EXISTS "Bidders can view their assignments" ON profile_assignments;
        DROP POLICY IF EXISTS "Managers can view assignments for their profiles" ON profile_assignments;
        DROP POLICY IF EXISTS "Admins can view all assignments" ON profile_assignments;
        DROP POLICY IF EXISTS "Managers can assign profiles to bidders" ON profile_assignments;
        DROP POLICY IF EXISTS "Admins can assign profiles" ON profile_assignments;
        DROP POLICY IF EXISTS "Managers can delete assignments for their profiles" ON profile_assignments;
        DROP POLICY IF EXISTS "Admins can delete assignments" ON profile_assignments;
    END IF;
END $$;

-- Drop policies on user_roles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
        DROP POLICY IF EXISTS "Users can view their own role" ON user_roles;
        DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
        DROP POLICY IF EXISTS "Allow authenticated users to view roles" ON user_roles;
        DROP POLICY IF EXISTS "Admins can insert roles" ON user_roles;
        DROP POLICY IF EXISTS "Admins can update roles" ON user_roles;
        DROP POLICY IF EXISTS "Admins can delete roles" ON user_roles;
    END IF;
END $$;

-- Drop policies on profiles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        DROP POLICY IF EXISTS "Users can view their own profiles" ON profiles;
        DROP POLICY IF EXISTS "Managers can view profiles they own" ON profiles;
        DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
        DROP POLICY IF EXISTS "Users can insert their own profiles" ON profiles;
        DROP POLICY IF EXISTS "Managers can insert profiles" ON profiles;
        DROP POLICY IF EXISTS "Users can update their own profiles" ON profiles;
        DROP POLICY IF EXISTS "Managers can update their profiles" ON profiles;
        DROP POLICY IF EXISTS "Users can delete their own profiles" ON profiles;
        DROP POLICY IF EXISTS "Managers can delete their profiles" ON profiles;
    END IF;
END $$;

-- =====================================================
-- 4. DROP ALL INDEXES (with error handling)
-- =====================================================

-- Drop indexes on job_applications table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
        DROP INDEX IF EXISTS idx_job_applications_profile_id;
        DROP INDEX IF EXISTS idx_job_applications_bidder_id;
        DROP INDEX IF EXISTS idx_job_applications_created_at;
    END IF;
END $$;

-- Drop indexes on profile_assignments table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_assignments') THEN
        DROP INDEX IF EXISTS idx_profile_assignments_profile_id;
        DROP INDEX IF EXISTS idx_profile_assignments_bidder_id;
    END IF;
END $$;

-- Drop indexes on user_roles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
        DROP INDEX IF EXISTS idx_user_roles_user_id;
    END IF;
END $$;

-- Drop indexes on profiles table (if it exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        DROP INDEX IF EXISTS idx_profiles_user_id;
        DROP INDEX IF EXISTS idx_profiles_created_at;
    END IF;
END $$;

-- =====================================================
-- 5. DROP ALL TABLES (with error handling)
-- =====================================================

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS profile_assignments CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- =====================================================
-- 6. DROP ENUMS
-- =====================================================

-- Drop user_role enum
DROP TYPE IF EXISTS user_role CASCADE;

-- =====================================================
-- 7. DISABLE ROW LEVEL SECURITY (if any tables still exist)
-- =====================================================

-- Note: These commands will fail if tables don't exist, which is fine
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
        ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
        ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profile_assignments') THEN
        ALTER TABLE profile_assignments DISABLE ROW LEVEL SECURITY;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_applications') THEN
        ALTER TABLE job_applications DISABLE ROW LEVEL SECURITY;
    END IF;
END $$;

-- =====================================================
-- 8. CLEANUP COMPLETION MESSAGE
-- =====================================================

-- This will show a success message in the SQL editor
SELECT 'Database cleanup completed successfully! All existing objects have been removed.' as status;

-- =====================================================
-- 9. VERIFICATION QUERIES
-- =====================================================

-- Check if any of our tables still exist
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All tables removed successfully'
        ELSE '⚠️ Some tables still exist: ' || string_agg(table_name, ', ')
    END as table_status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_roles', 'profile_assignments', 'job_applications');

-- Check if any of our functions still exist
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All functions removed successfully'
        ELSE '⚠️ Some functions still exist: ' || string_agg(routine_name, ', ')
    END as function_status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_updated_at_column', 'ensure_user_role', 'get_user_role', 'can_access_profile');

-- Check if any of our enums still exist
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN '✅ All enums removed successfully'
        ELSE '⚠️ Some enums still exist: ' || string_agg(typname, ', ')
    END as enum_status
FROM pg_type 
WHERE typname = 'user_role'; 