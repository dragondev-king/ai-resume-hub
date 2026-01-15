-- =====================================================
-- 18. ADD CHECK DUPLICATE APPLICATIONS FIELD
-- =====================================================
-- This migration adds a field to allow profile owners to optionally check for duplicate applications to companies

-- Add the check_duplicate_applications column with default value true (checking enabled by default)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS check_duplicate_applications BOOLEAN DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN profiles.check_duplicate_applications IS 'Whether to check for duplicate applications to the same company (true) or allow multiple applications (false)';

-- Update the upsert_profile function to include the new parameter
CREATE OR REPLACE FUNCTION upsert_profile(
  p_user_id UUID, 
  p_first_name TEXT, 
  p_last_name TEXT, 
  p_email TEXT, 
  p_phone TEXT, 
  p_location TEXT, 
  p_title TEXT DEFAULT NULL, 
  p_profile_id UUID DEFAULT NULL, 
  p_linkedin TEXT DEFAULT NULL, 
  p_portfolio TEXT DEFAULT NULL, 
  p_summary TEXT DEFAULT NULL, 
  p_experience JSONB DEFAULT NULL, 
  p_education JSONB DEFAULT NULL, 
  p_skills TEXT[] DEFAULT NULL,
  p_resume_filename_format TEXT DEFAULT 'first_last',
  p_is_active BOOLEAN DEFAULT true,
  p_check_duplicate_applications BOOLEAN DEFAULT true
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_id UUID;
BEGIN
  IF p_profile_id IS NULL THEN
    INSERT INTO profiles (user_id, first_name, last_name, title, email, phone, location, linkedin, portfolio, summary, experience, education, skills, resume_filename_format, is_active, check_duplicate_applications)
    VALUES (p_user_id, p_first_name, p_last_name, p_title, p_email, p_phone, p_location, p_linkedin, p_portfolio, p_summary, p_experience, p_education, p_skills, p_resume_filename_format, p_is_active, p_check_duplicate_applications)
    RETURNING id INTO v_profile_id;
  ELSE
    UPDATE profiles SET 
      first_name = p_first_name, 
      last_name = p_last_name, 
      title = p_title, 
      email = p_email, 
      phone = p_phone, 
      location = p_location, 
      linkedin = p_linkedin, 
      portfolio = p_portfolio, 
      summary = p_summary, 
      experience = p_experience, 
      education = p_education, 
      skills = p_skills, 
      resume_filename_format = p_resume_filename_format,
      is_active = p_is_active,
      check_duplicate_applications = p_check_duplicate_applications,
      updated_at = NOW() 
    WHERE id = p_profile_id;
    v_profile_id := p_profile_id;
  END IF;
  RETURN v_profile_id;
END; $$;

-- Update the get_profiles_with_details function to include the new field
CREATE OR REPLACE FUNCTION get_profiles_with_details(p_user_id UUID, p_user_role user_role)
RETURNS TABLE (
  id UUID, user_id UUID, first_name TEXT, last_name TEXT, title TEXT, email TEXT, phone TEXT, location TEXT,
  linkedin TEXT, portfolio TEXT, summary TEXT, experience JSONB, education JSONB, skills TEXT[],
  resume_filename_format TEXT, is_active BOOLEAN, check_duplicate_applications BOOLEAN, created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  owner_id UUID, owner_email TEXT, owner_first_name TEXT, owner_last_name TEXT, owner_role user_role,
  assigned_bidders JSONB
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    SELECT ARRAY_AGG(pa.profile_id) INTO v_profile_ids FROM profile_assignments pa WHERE pa.bidder_id = p_user_id;
  END IF;

  RETURN QUERY SELECT 
    p.id, p.user_id, p.first_name, p.last_name, p.title, p.email, p.phone, p.location,
    p.linkedin, p.portfolio, p.summary, p.experience, p.education, p.skills,
    p.resume_filename_format, p.is_active, p.check_duplicate_applications, p.created_at, p.updated_at, 
    u.id as owner_id, u.email as owner_email,
    u.first_name as owner_first_name, u.last_name as owner_last_name, u.role as owner_role,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u_bidder.id, 'email', u_bidder.email, 'first_name', u_bidder.first_name, 'last_name', u_bidder.last_name))
      FROM profile_assignments pa JOIN users u_bidder ON pa.bidder_id = u_bidder.id WHERE pa.profile_id = p.id), '[]'::jsonb) as assigned_bidders
  FROM profiles p LEFT JOIN users u ON p.user_id = u.id
  WHERE (p_user_role = 'admin') OR (p_user_role = 'manager' AND p.user_id = p_user_id) OR (p_user_role = 'bidder' AND p.id = ANY(v_profile_ids))
  ORDER BY p.created_at DESC;
END; $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION upsert_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT[], TEXT, BOOLEAN, BOOLEAN) TO authenticated;

SELECT 'Check duplicate applications field added successfully!' as status;
