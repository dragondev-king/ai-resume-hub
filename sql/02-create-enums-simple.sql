-- =====================================================
-- 02. CREATE ENUMS - SIMPLE SETUP
-- =====================================================

-- Create user role enum
CREATE TYPE user_role AS ENUM ('bidder', 'manager', 'admin');

SELECT 'Enums created successfully!' as status; 