-- =====================================================
-- 22. ADD JOB_APPLICATIONS.METADATA (JSONB)
-- =====================================================
-- Store per-application settings such as resumeTemplateId so re-downloads
-- reuse the same resume layout template.

ALTER TABLE job_applications
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb NOT NULL;

COMMENT ON COLUMN job_applications.metadata IS 'Arbitrary JSON for this application (e.g. resumeTemplateId).';

-- Drop prior create_job_application signature (from migration 19)
DROP FUNCTION IF EXISTS create_job_application(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[]);

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
  p_generated_skills TEXT[] DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_application_id UUID;
  v_existing_count INTEGER;
  v_check_duplicates BOOLEAN;
BEGIN
  SELECT COALESCE(check_duplicate_applications, true) INTO v_check_duplicates
  FROM profiles
  WHERE id = p_profile_id;

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

  INSERT INTO job_applications (
    profile_id, bidder_id, job_title, company_name, job_description, job_description_link,
    resume_file_name, generated_summary, generated_experience, generated_skills, status, metadata
  )
  VALUES (
    p_profile_id, p_bidder_id, p_job_title, p_company_name, p_job_description, p_job_description_link,
    p_resume_file_name, p_generated_summary, p_generated_experience, p_generated_skills, 'active',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_application_id;

  RETURN v_application_id;
END; $$;

-- Merge metadata into an existing application (e.g. backfill template on first re-download)
CREATE OR REPLACE FUNCTION update_job_application_metadata(
  p_application_id UUID,
  p_metadata JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE job_applications
  SET metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_application_id;
END; $$;

-- Update list RPC to return metadata (keeps job-title filter from migration 21)
DROP FUNCTION IF EXISTS get_job_applications_with_filters(UUID, user_role, UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, application_status, TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION get_job_applications_with_filters(
  p_user_id UUID,
  p_user_role user_role,
  p_profile_id UUID DEFAULT NULL,
  p_bidder_id UUID DEFAULT NULL,
  p_date_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_to TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_range TEXT DEFAULT 'all',
  p_status application_status DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL,
  p_job_title TEXT DEFAULT NULL,
  p_page_size INTEGER DEFAULT 10,
  p_page_number INTEGER DEFAULT 1
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
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
DECLARE v_start_date TIMESTAMP WITH TIME ZONE;
DECLARE v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    v_profile_ids := NULL;
  END IF;

  IF p_date_range = 'today' THEN
    v_start_date := date_trunc('day', CURRENT_DATE);
    v_end_date := v_start_date + interval '23:59:59';
  ELSIF p_date_range = 'yesterday' THEN
    v_start_date := date_trunc('day', CURRENT_DATE - interval '1 day');
    v_end_date := v_start_date + interval '23:59:59';
  ELSIF p_date_range = 'last-week' THEN
    v_start_date := date_trunc('week', CURRENT_DATE - interval '1 week');
    v_end_date := v_start_date + interval '6 days 23:59:59';
  ELSIF p_date_range = 'last-month' THEN
    v_start_date := date_trunc('month', CURRENT_DATE - interval '1 month');
    v_end_date := (v_start_date + interval '1 month') - interval '1 second';
  ELSIF p_date_range = 'this-week' THEN
    v_start_date := date_trunc('week', CURRENT_DATE);
    v_end_date := v_start_date + interval '6 days 23:59:59';
  ELSIF p_date_range = 'this-month' THEN
    v_start_date := date_trunc('month', CURRENT_DATE);
    v_end_date := (v_start_date + interval '1 month') - interval '1 second';
  ELSIF p_date_range = 'custom' THEN
    v_start_date := p_date_from;
    v_end_date := p_date_to;
  ELSE
    v_start_date := NULL;
    v_end_date := NULL;
  END IF;

  RETURN QUERY SELECT
    ja.id, ja.profile_id, ja.bidder_id, ja.job_title, ja.company_name,
    ja.job_description, ja.job_description_link, ja.resume_file_name,
    ja.generated_summary, ja.generated_experience, ja.generated_skills,
    ja.status, ja.rejected_at, ja.withdrawn_at,
    ja.created_at, ja.created_at as updated_at,
    p.first_name as profile_first_name, p.last_name as profile_last_name, p.email as profile_email,
    b.first_name as bidder_first_name, b.last_name as bidder_last_name, b.email as bidder_email,
    COALESCE(ja.metadata, '{}'::jsonb) AS metadata
  FROM job_applications ja
  JOIN profiles p ON ja.profile_id = p.id
  JOIN users b ON ja.bidder_id = b.id
  WHERE
    ((p_user_role = 'admin') OR
     (p_user_role = 'manager' AND ja.profile_id = ANY(v_profile_ids)) OR
     (p_user_role = 'bidder' AND ja.bidder_id = p_user_id))
    AND (p_profile_id IS NULL OR ja.profile_id = p_profile_id)
    AND (p_bidder_id IS NULL OR ja.bidder_id = p_bidder_id)
    AND (p_status IS NULL OR ja.status = p_status)
    AND (p_company_name IS NULL OR ja.company_name ILIKE '%' || p_company_name || '%')
    AND (p_job_title IS NULL OR ja.job_title ILIKE '%' || p_job_title || '%')
    AND (v_start_date IS NULL OR ja.created_at >= v_start_date)
    AND (v_end_date IS NULL OR ja.created_at <= v_end_date)
  ORDER BY ja.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END; $$;

GRANT EXECUTE ON FUNCTION create_job_application(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT[], JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION update_job_application_metadata(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION get_job_applications_with_filters(UUID, user_role, UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, application_status, TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

SELECT 'Job applications metadata column and RPC updates applied successfully!' AS status;
