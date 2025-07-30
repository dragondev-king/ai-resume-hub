-- =====================================================
-- 01. CLEANUP SIMPLE SETUP
-- =====================================================
-- This script removes all existing database objects to start fresh

-- Drop triggers first
DROP TRIGGER IF EXISTS sync_user_trigger ON auth.users;
DROP FUNCTION IF EXISTS sync_user_to_public();

-- Drop tables with CASCADE to remove all dependencies
DROP TABLE IF EXISTS job_applications CASCADE;
DROP TABLE IF EXISTS profile_assignments CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop enums
DROP TYPE IF EXISTS user_role CASCADE;

SELECT 'Simple cleanup completed successfully!' as status; 