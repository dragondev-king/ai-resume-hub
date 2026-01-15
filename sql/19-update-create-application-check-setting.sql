-- =====================================================
-- 19. UPDATE CREATE APPLICATION TO RESPECT CHECK SETTING
-- =====================================================
-- This updates the create_job_application function to respect the profile's check_duplicate_applications setting
-- and removes the unique constraint to allow multiple applications when checking is disabled

-- Drop the unique constraint since we now handle duplicate checking based on profile settings
DROP INDEX IF EXISTS idx_unique_active_company_application;

-- Update the create_job_application function to check the profile's check_duplicate_applications setting
CREATE OR REPLACE FUNCTION create_job_application(
  p_profile_id UUID, 
  p_bidder_id UUID, 
  p_job_title TEXT, 
  p_job_description TEXT, 
  p_company_name TEXT DEFAULT NULL, 
  p_job_description_link TEXT DEFAULT NULL, 
  p_resume_file_name TEXT DEFAULT NULL, 
  p_generated_summary TEXT DEFAULT NULL, 
  p_generated_experience JSONB DEFAULT NULL, 
  p_generated_skills TEXT[] DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE 
  v_application_id UUID;
  v_existing_count INTEGER;
  v_check_duplicates BOOLEAN;
BEGIN
  -- Get the profile's check_duplicate_applications setting (defaults to true if not set)
  SELECT COALESCE(check_duplicate_applications, true) INTO v_check_duplicates
  FROM profiles
  WHERE id = p_profile_id;
  
  -- Only check for duplicates if the profile has duplicate checking enabled
  IF v_check_duplicates AND p_company_name IS NOT NULL THEN
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

SELECT 'Create application function updated to respect check_duplicate_applications setting!' as status;
