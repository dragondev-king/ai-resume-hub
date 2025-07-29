-- =====================================================
-- AI Resume Generator - Database Verification Script
-- =====================================================
-- This script verifies that the database structure is correct

-- =====================================================
-- 1. CHECK TABLES EXIST
-- =====================================================

SELECT 'Tables Check' as check_type, 
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) = 4 THEN '✅ All tables exist'
         ELSE '❌ Missing tables: ' || (4 - COUNT(*)) || ' tables missing'
       END as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_roles', 'profile_assignments', 'job_applications');

-- =====================================================
-- 2. CHECK FOREIGN KEY RELATIONSHIPS
-- =====================================================

-- Check job_applications foreign keys
SELECT 'job_applications foreign keys' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) = 2 THEN '✅ All foreign keys exist'
         ELSE '❌ Missing foreign keys: ' || (2 - COUNT(*)) || ' foreign keys missing'
       END as status
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
WHERE tc.table_name = 'job_applications' 
AND tc.constraint_type = 'FOREIGN KEY'
AND ccu.table_name IN ('profiles', 'auth.users');

-- =====================================================
-- 3. CHECK SPECIFIC FOREIGN KEY DETAILS
-- =====================================================

-- Show job_applications foreign key details
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'job_applications' 
AND tc.constraint_type = 'FOREIGN KEY';

-- =====================================================
-- 4. CHECK ROW LEVEL SECURITY
-- =====================================================

SELECT 'Row Level Security' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) = 4 THEN '✅ RLS enabled on all tables'
         ELSE '❌ RLS not enabled on all tables: ' || (4 - COUNT(*)) || ' tables missing RLS'
       END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'user_roles', 'profile_assignments', 'job_applications')
AND rowsecurity = true;

-- =====================================================
-- 5. CHECK POLICIES
-- =====================================================

SELECT 'Policies' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) >= 20 THEN '✅ All policies exist'
         ELSE '❌ Missing policies: ' || (20 - COUNT(*)) || ' policies missing'
       END as status
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'user_roles', 'profile_assignments', 'job_applications');

-- =====================================================
-- 6. CHECK FUNCTIONS
-- =====================================================

SELECT 'Functions' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) = 4 THEN '✅ All functions exist'
         ELSE '❌ Missing functions: ' || (4 - COUNT(*)) || ' functions missing'
       END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('update_updated_at_column', 'ensure_user_role', 'get_user_role', 'can_access_profile');

-- =====================================================
-- 7. CHECK TRIGGERS
-- =====================================================

SELECT 'Triggers' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) >= 3 THEN '✅ All triggers exist'
         ELSE '❌ Missing triggers: ' || (3 - COUNT(*)) || ' triggers missing'
       END as status
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
AND event_object_table IN ('profiles', 'user_roles', 'auth.users');

-- =====================================================
-- 8. CHECK ENUMS
-- =====================================================

SELECT 'Enums' as check_type,
       COUNT(*) as count,
       CASE 
         WHEN COUNT(*) = 1 THEN '✅ user_role enum exists'
         ELSE '❌ user_role enum missing'
       END as status
FROM pg_type 
WHERE typname = 'user_role';

-- =====================================================
-- 9. TEST QUERY (if you have data)
-- =====================================================

-- Test a simple query on job_applications
SELECT 'Test Query' as check_type,
       CASE 
         WHEN EXISTS (SELECT 1 FROM job_applications LIMIT 1) THEN '✅ Query successful'
         ELSE '✅ Query successful (no data)'
       END as status; 