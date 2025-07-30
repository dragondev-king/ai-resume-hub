-- =====================================================
-- 06. SYNC EXISTING USERS
-- =====================================================

-- Sync existing users from auth.users to public.users
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

SELECT 'Existing users synced successfully!' as status; 