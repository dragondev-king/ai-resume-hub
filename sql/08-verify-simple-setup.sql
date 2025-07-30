-- =====================================================
-- 08. VERIFY SIMPLE SETUP
-- =====================================================

-- Check if all tables exist
SELECT 
  'Tables' as category,
  table_name as name,
  'EXISTS' as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'profile_assignments', 'job_applications', 'users')
ORDER BY table_name;

-- Check if enums exist
SELECT 
  'Enums' as category,
  typname as name,
  'EXISTS' as status
FROM pg_type 
WHERE typname = 'user_role';

-- Check if trigger exists
SELECT 
  'Trigger' as category,
  tgname as name,
  'EXISTS' as status
FROM pg_trigger 
WHERE tgrelid = 'auth.users'::regclass
    AND tgname = 'sync_user_trigger';

-- Check if function exists
SELECT 
  'Function' as category,
  proname as name,
  'EXISTS' as status
FROM pg_proc 
WHERE proname = 'sync_user_to_public';

-- Check if indexes exist
SELECT 
  'Indexes' as category,
  indexname as name,
  'EXISTS' as status
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'profile_assignments', 'job_applications', 'users')
ORDER BY tablename, indexname;

-- Check user counts
SELECT 
  'User Counts' as category,
  'auth.users' as table_name,
  COUNT(*) as user_count
FROM auth.users
UNION ALL
SELECT 
  'User Counts' as category,
  'public.users' as table_name,
  COUNT(*) as user_count
FROM public.users;

-- Check for admin users
SELECT 
  'Admin Users' as category,
  email,
  role,
  'EXISTS' as status
FROM public.users 
WHERE role = 'admin';

SELECT 'Simple setup verification completed!' as status; 