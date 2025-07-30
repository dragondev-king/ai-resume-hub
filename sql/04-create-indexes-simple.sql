-- =====================================================
-- 04. CREATE INDEXES - SIMPLE SETUP
-- =====================================================

-- Users indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Profiles indexes
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_created_at ON profiles(created_at);

-- Profile assignments indexes
CREATE INDEX idx_profile_assignments_profile_id ON profile_assignments(profile_id);
CREATE INDEX idx_profile_assignments_bidder_id ON profile_assignments(bidder_id);
CREATE INDEX idx_profile_assignments_created_at ON profile_assignments(created_at);

-- Job applications indexes
CREATE INDEX idx_job_applications_profile_id ON job_applications(profile_id);
CREATE INDEX idx_job_applications_bidder_id ON job_applications(bidder_id);
CREATE INDEX idx_job_applications_created_at ON job_applications(created_at);

SELECT 'Indexes created successfully!' as status; 