-- =====================================================
-- 24. JOB APPLICATION DETAILS LOOKUPS
-- =====================================================
-- Deep-link a single application from /applications?applicationId=...
-- and return the existing active application id from can_apply_to_company
-- (null means the profile can apply).
--
-- Re-run this file in the Supabase SQL editor to create/replace the functions.

DROP FUNCTION IF EXISTS get_job_application_by_id(UUID, UUID, user_role);
-- Return type changes from BOOLEAN to UUID, so REPLACE is not enough.
DROP FUNCTION IF EXISTS can_apply_to_company(UUID, TEXT);

CREATE OR REPLACE FUNCTION get_job_application_by_id(
  p_application_id UUID,
  p_user_id UUID,
  p_user_role user_role
)
RETURNS TABLE (
  id UUID, profile_id UUID, bidder_id UUID, job_title TEXT, company_name TEXT,
  job_description TEXT, job_description_link TEXT, resume_file_name TEXT,
  generated_summary TEXT, generated_experience JSONB, generated_skills TEXT[],
  status application_status, rejected_at TIMESTAMP WITH TIME ZONE, withdrawn_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE, updated_at TIMESTAMP WITH TIME ZONE,
  profile_first_name TEXT, profile_last_name TEXT, profile_email TEXT,
  bidder_first_name TEXT, bidder_last_name TEXT, bidder_email TEXT,
  metadata JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  END IF;

  RETURN QUERY SELECT
    ja.id, ja.profile_id, ja.bidder_id, ja.job_title, ja.company_name,
    ja.job_description, ja.job_description_link, ja.resume_file_name,
    ja.generated_summary, ja.generated_experience, ja.generated_skills,
    ja.status, ja.rejected_at, ja.withdrawn_at,
    ja.created_at, ja.created_at AS updated_at,
    p.first_name AS profile_first_name, p.last_name AS profile_last_name, p.email AS profile_email,
    b.first_name AS bidder_first_name, b.last_name AS bidder_last_name, b.email AS bidder_email,
    COALESCE(ja.metadata, '{}'::jsonb) AS metadata
  FROM job_applications ja
  JOIN profiles p ON ja.profile_id = p.id
  JOIN users b ON ja.bidder_id = b.id
  WHERE ja.id = p_application_id
    AND (
      (p_user_role = 'admin') OR
      (p_user_role = 'manager' AND ja.profile_id = ANY(v_profile_ids)) OR
      (p_user_role = 'bidder' AND ja.bidder_id = p_user_id)
    );
END; $$;

CREATE OR REPLACE FUNCTION can_apply_to_company(p_profile_id UUID, p_company_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_application_id UUID;
BEGIN
  IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
    RETURN NULL;
  END IF;

  SELECT ja.id INTO v_application_id
  FROM job_applications ja
  WHERE ja.profile_id = p_profile_id
    AND ja.company_name = p_company_name
    AND ja.status = 'active'
  ORDER BY ja.created_at DESC
  LIMIT 1;

  RETURN v_application_id;
END; $$;

GRANT EXECUTE ON FUNCTION get_job_application_by_id(UUID, UUID, user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION can_apply_to_company(UUID, TEXT) TO authenticated;

SELECT 'Job application details lookup functions created successfully!' AS status;
