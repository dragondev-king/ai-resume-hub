-- =====================================================
-- 07. SETUP ADMIN USER
-- =====================================================

-- Set your user as admin (replace with your user ID)
-- Uncomment and modify the line below with your actual user ID
-- INSERT INTO users (id, email, first_name, last_name, role, is_active) 
-- VALUES ('YOUR_USER_ID_HERE', 'your-email@example.com', '', '', 'admin', true)
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Example for the user ID from your logs:
-- INSERT INTO users (id, email, first_name, last_name, role, is_active) 
-- VALUES ('43339c7a-ca36-448c-a261-7c3c27c2c65b', 'dragondev1017@gmail.com', '', '', 'admin', true)
-- ON CONFLICT (id) DO UPDATE SET role = 'admin';

SELECT 'Admin user setup completed! Please manually insert your admin role.' as status; 