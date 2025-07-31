-- =====================================================
-- 09. COMPREHENSIVE RPC FUNCTIONS - FULL APPLICATION
-- =====================================================

-- USER MANAGEMENT FUNCTIONS
CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
  id UUID, email TEXT, first_name TEXT, last_name TEXT, phone TEXT,
  role user_role, is_active BOOLEAN, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.is_active, u.created_at, u.updated_at
  FROM users u ORDER BY u.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION update_user_details(p_user_id UUID, p_email TEXT, p_first_name TEXT, p_last_name TEXT, p_phone TEXT, p_role user_role)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users SET email = p_email, first_name = p_first_name, last_name = p_last_name, phone = p_phone, role = p_role, updated_at = NOW()
  WHERE id = p_user_id; RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION get_user_by_id(p_user_id UUID)
RETURNS TABLE (id UUID, email TEXT, first_name TEXT, last_name TEXT, phone TEXT, role user_role, is_active BOOLEAN, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE) 
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.is_active, u.created_at, u.updated_at
  FROM users u WHERE u.id = p_user_id;
END; $$;

-- PROFILE MANAGEMENT FUNCTIONS
CREATE OR REPLACE FUNCTION get_profiles_with_details(p_user_id UUID, p_user_role user_role)
RETURNS TABLE (
  id UUID, user_id UUID, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, location TEXT,
  linkedin TEXT, portfolio TEXT, summary TEXT, experience JSONB, education JSONB, skills TEXT[],
  created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  owner_id UUID, owner_email TEXT, owner_first_name TEXT, owner_last_name TEXT, owner_role user_role,
  assigned_bidders JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(id) INTO v_profile_ids FROM profiles WHERE user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    SELECT ARRAY_AGG(profile_id) INTO v_profile_ids FROM profile_assignments WHERE bidder_id = p_user_id;
  END IF;

  RETURN QUERY SELECT 
    p.id, p.user_id, p.first_name, p.last_name, p.email, p.phone, p.location,
    p.linkedin, p.portfolio, p.summary, p.experience, p.education, p.skills,
    p.created_at, p.updated_at, u.id as owner_id, u.email as owner_email,
    u.first_name as owner_first_name, u.last_name as owner_last_name, u.role as owner_role,
    COALESCE((SELECT json_agg(json_build_object('id', bidder.id, 'email', bidder.email, 'first_name', bidder.first_name, 'last_name', bidder.last_name))
      FROM profile_assignments pa JOIN users bidder ON pa.bidder_id = bidder.id WHERE pa.profile_id = p.id), '[]'::json) as assigned_bidders
  FROM profiles p LEFT JOIN users u ON p.user_id = u.id
  WHERE (p_user_role = 'admin') OR (p_user_role = 'manager' AND p.user_id = p_user_id) OR (p_user_role = 'bidder' AND p.id = ANY(v_profile_ids))
  ORDER BY p.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION upsert_profile(p_user_id UUID, p_first_name TEXT, p_last_name TEXT, p_email TEXT, p_phone TEXT, p_location TEXT, p_profile_id UUID DEFAULT NULL, p_linkedin TEXT DEFAULT NULL, p_portfolio TEXT DEFAULT NULL, p_summary TEXT DEFAULT NULL, p_experience JSONB DEFAULT NULL, p_education JSONB DEFAULT NULL, p_skills TEXT[] DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_id UUID;
BEGIN
  IF p_profile_id IS NULL THEN
    INSERT INTO profiles (user_id, first_name, last_name, email, phone, location, linkedin, portfolio, summary, experience, education, skills)
    VALUES (p_user_id, p_first_name, p_last_name, p_email, p_phone, p_location, p_linkedin, p_portfolio, p_summary, p_experience, p_education, p_skills)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE profiles SET first_name = p_first_name, last_name = p_last_name, email = p_email, phone = p_phone, location = p_location, linkedin = p_linkedin, portfolio = p_portfolio, summary = p_summary, experience = p_experience, education = p_education, skills = p_skills, updated_at = NOW() WHERE id = p_profile_id;
    v_profile_id := p_profile_id;
  END IF;
  RETURN v_profile_id;
END; $$;

CREATE OR REPLACE FUNCTION delete_profile(p_profile_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM profiles WHERE id = p_profile_id; RETURN FOUND; END; $$;

-- PROFILE ASSIGNMENT FUNCTIONS
CREATE OR REPLACE FUNCTION get_profile_assignments_with_details(p_user_id UUID, p_user_role user_role)
RETURNS TABLE (
  id UUID, profile_id UUID, bidder_id UUID, assigned_by UUID, created_at TIMESTAMP WITH TIME ZONE,
  profile_first_name TEXT, profile_last_name TEXT, profile_email TEXT,
  bidder_first_name TEXT, bidder_last_name TEXT, bidder_email TEXT,
  assigned_by_first_name TEXT, assigned_by_last_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(id) INTO v_profile_ids FROM profiles WHERE user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT 
    pa.id, pa.profile_id, pa.bidder_id, pa.assigned_by, pa.created_at,
    p.first_name as profile_first_name, p.last_name as profile_last_name, p.email as profile_email,
    b.first_name as bidder_first_name, b.last_name as bidder_last_name, b.email as bidder_email,
    ab.first_name as assigned_by_first_name, ab.last_name as assigned_by_last_name
  FROM profile_assignments pa
  JOIN profiles p ON pa.profile_id = p.id
  JOIN users b ON pa.bidder_id = b.id
  JOIN users ab ON pa.assigned_by = ab.id
  WHERE (p_user_role = 'admin') OR (p_user_role = 'manager' AND pa.profile_id = ANY(v_profile_ids)) OR (p_user_role = 'bidder' AND pa.bidder_id = p_user_id)
  ORDER BY pa.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION create_profile_assignment(p_profile_id UUID, p_bidder_id UUID, p_assigned_by UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_assignment_id UUID;
BEGIN
  INSERT INTO profile_assignments (profile_id, bidder_id, assigned_by) VALUES (p_profile_id, p_bidder_id, p_assigned_by) RETURNING id INTO v_assignment_id;
  RETURN v_assignment_id;
END; $$;

CREATE OR REPLACE FUNCTION delete_profile_assignment(p_assignment_id UUID) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM profile_assignments WHERE id = p_assignment_id; RETURN FOUND; END; $$;

-- RESUME GENERATOR FUNCTIONS
CREATE OR REPLACE FUNCTION get_profiles_for_resume_generation(p_user_id UUID, p_user_role user_role)
RETURNS TABLE (
  id UUID, first_name TEXT, last_name TEXT, email TEXT, phone TEXT, location TEXT,
  linkedin TEXT, portfolio TEXT, summary TEXT, experience JSONB, education JSONB, skills TEXT[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(id) INTO v_profile_ids FROM profiles WHERE user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    SELECT ARRAY_AGG(profile_id) INTO v_profile_ids FROM profile_assignments WHERE bidder_id = p_user_id;
  END IF;

  RETURN QUERY SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.location, p.linkedin, p.portfolio, p.summary, p.experience, p.education, p.skills
  FROM profiles p
  WHERE (p_user_role = 'admin') OR (p_user_role = 'manager' AND p.user_id = p_user_id) OR (p_user_role = 'bidder' AND p.id = ANY(v_profile_ids))
  ORDER BY p.first_name, p.last_name;
END; $$;

CREATE OR REPLACE FUNCTION create_job_application(p_profile_id UUID, p_bidder_id UUID, p_job_title TEXT, p_job_description TEXT, p_company_name TEXT DEFAULT NULL, p_job_description_link TEXT DEFAULT NULL, p_resume_file_name TEXT DEFAULT NULL, p_generated_summary TEXT DEFAULT NULL, p_generated_experience JSONB DEFAULT NULL, p_generated_skills TEXT[] DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_application_id UUID;
BEGIN
  INSERT INTO job_applications (profile_id, bidder_id, job_title, company_name, job_description, job_description_link, resume_file_name, generated_summary, generated_experience, generated_skills)
  VALUES (p_profile_id, p_bidder_id, p_job_title, p_company_name, p_job_description, p_job_description_link, p_resume_file_name, p_generated_summary, p_generated_experience, p_generated_skills)
  RETURNING id INTO v_application_id;
  RETURN v_application_id;
END; $$;

-- GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_all_users() TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_details(UUID, TEXT, TEXT, TEXT, TEXT, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profiles_with_details(UUID, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_assignments_with_details(UUID, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION create_profile_assignment(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_profile_assignment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profiles_for_resume_generation(UUID, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION create_job_application(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]) TO authenticated;

SELECT 'Comprehensive RPC functions created successfully!' as status; 