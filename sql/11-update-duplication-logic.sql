-- =====================================================
-- 11. UPDATE DUPLICATION LOGIC
-- =====================================================
-- This updates the duplication check logic from (bidder_id, company_name) to (profile_id, company_name)
-- This allows managers/admins to submit applications for different profiles to the same company

-- Drop the existing unique index
DROP INDEX IF EXISTS idx_unique_active_company_application;

-- Create new unique constraint based on profile_id and company_name
-- This ensures a profile can only have one active application per company
CREATE UNIQUE INDEX idx_unique_active_company_application 
ON job_applications (profile_id, company_name) 
WHERE status = 'active' AND company_name IS NOT NULL;

-- Update the can_apply_to_company function to check by profile_id instead of bidder_id
CREATE OR REPLACE FUNCTION can_apply_to_company(p_profile_id UUID, p_company_name TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_existing_count INTEGER;
BEGIN
  -- Check if there's already an active application to this company for this profile
  SELECT COUNT(*) INTO v_existing_count
  FROM job_applications 
  WHERE profile_id = p_profile_id 
    AND company_name = p_company_name 
    AND status = 'active';
  
  RETURN v_existing_count = 0;
END; $$;

-- Update the create_job_application function to check for existing applications by profile_id
CREATE OR REPLACE FUNCTION create_job_application(p_profile_id UUID, p_bidder_id UUID, p_job_title TEXT, p_job_description TEXT, p_company_name TEXT DEFAULT NULL, p_job_description_link TEXT DEFAULT NULL, p_resume_file_name TEXT DEFAULT NULL, p_generated_summary TEXT DEFAULT NULL, p_generated_experience JSONB DEFAULT NULL, p_generated_skills TEXT[] DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_application_id UUID;
DECLARE v_existing_count INTEGER;
BEGIN
  -- Check if there's already an active application to this company for this profile
  IF p_company_name IS NOT NULL THEN
    SELECT COUNT(*) INTO v_existing_count
    FROM job_applications 
    WHERE profile_id = p_profile_id 
      AND company_name = p_company_name 
      AND status = 'active';
    
    IF v_existing_count > 0 THEN
      RAISE EXCEPTION 'This profile already has an active application to %', p_company_name;
    END IF;
  END IF;

  INSERT INTO job_applications (profile_id, bidder_id, job_title, company_name, job_description, job_description_link, resume_file_name, generated_summary, generated_experience, generated_skills, status)
  VALUES (p_profile_id, p_bidder_id, p_job_title, p_company_name, p_job_description, p_job_description_link, p_resume_file_name, p_generated_summary, p_generated_experience, p_generated_skills, 'active')
  RETURNING id INTO v_application_id;
  
  RETURN v_application_id;
END; $$;

-- Grant permissions for updated functions
GRANT EXECUTE ON FUNCTION can_apply_to_company(UUID, TEXT) TO authenticated;

SELECT 'Duplication logic updated successfully! Now checking by (profile_id, company_name) instead of (bidder_id, company_name)' as status; 