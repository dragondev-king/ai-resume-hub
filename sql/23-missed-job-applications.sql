-- =====================================================
-- 23. MISSED JOB APPLICATIONS
-- =====================================================
-- Jobs other profiles applied to (with a job link) in the selected window
-- that the chosen profile has not applied to yet, matched by company name.
-- Access: admin = any profile; manager = owned profiles; bidder = assigned profiles.
--
-- Re-run this file in the Supabase SQL editor to replace the previous functions.

DROP FUNCTION IF EXISTS get_missed_job_applications(UUID, user_role, UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_missed_job_applications_count(UUID, user_role, UUID, TEXT);

CREATE OR REPLACE FUNCTION get_missed_job_applications(
  p_user_id UUID,
  p_user_role user_role,
  p_profile_id UUID,
  p_date_range TEXT DEFAULT 'this-week',
  p_page_size INTEGER DEFAULT 50,
  p_page_number INTEGER DEFAULT 1
)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  job_title TEXT,
  job_description_link TEXT,
  created_at TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER AS $$
#variable_conflict use_column
DECLARE
  v_allowed BOOLEAN := FALSE;
  v_start_date TIMESTAMP WITH TIME ZONE;
  v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_role = 'admin' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id);
  ELSIF p_user_role = 'manager' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id AND p.user_id = p_user_id);
  ELSIF p_user_role = 'bidder' THEN
    v_allowed := EXISTS (
      SELECT 1 FROM profile_assignments pa
      WHERE pa.profile_id = p_profile_id AND pa.bidder_id = p_user_id
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to view missed jobs for this profile';
  END IF;

  IF p_date_range = 'today' THEN
    v_start_date := date_trunc('day', CURRENT_DATE);
    v_end_date := v_start_date + interval '23:59:59';
  ELSE
    v_start_date := date_trunc('week', CURRENT_DATE);
    v_end_date := v_start_date + interval '6 days 23:59:59';
  END IF;

  RETURN QUERY
  SELECT
    src.application_id,
    src.out_company_name,
    src.out_job_title,
    src.out_job_link,
    src.out_created_at
  FROM (
    SELECT DISTINCT ON (lower(btrim(ja.company_name)))
      ja.id AS application_id,
      ja.company_name AS out_company_name,
      ja.job_title AS out_job_title,
      ja.job_description_link AS out_job_link,
      ja.created_at AS out_created_at
    FROM job_applications ja
    WHERE ja.profile_id <> p_profile_id
      AND ja.company_name IS NOT NULL
      AND btrim(ja.company_name) <> ''
      AND ja.job_description_link IS NOT NULL
      AND btrim(ja.job_description_link) <> ''
      AND ja.created_at >= v_start_date
      AND ja.created_at <= v_end_date
      AND NOT EXISTS (
        SELECT 1
        FROM job_applications mine
        WHERE mine.profile_id = p_profile_id
          AND mine.status = 'active'
          AND mine.company_name IS NOT NULL
          AND lower(btrim(mine.company_name)) = lower(btrim(ja.company_name))
      )
    ORDER BY lower(btrim(ja.company_name)), ja.created_at DESC
  ) src
  ORDER BY src.out_created_at DESC
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END; $$;

CREATE OR REPLACE FUNCTION get_missed_job_applications_count(
  p_user_id UUID,
  p_user_role user_role,
  p_profile_id UUID,
  p_date_range TEXT DEFAULT 'this-week'
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
  v_start_date TIMESTAMP WITH TIME ZONE;
  v_end_date TIMESTAMP WITH TIME ZONE;
  v_count INTEGER := 0;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_user_role = 'admin' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id);
  ELSIF p_user_role = 'manager' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles p WHERE p.id = p_profile_id AND p.user_id = p_user_id);
  ELSIF p_user_role = 'bidder' THEN
    v_allowed := EXISTS (
      SELECT 1 FROM profile_assignments pa
      WHERE pa.profile_id = p_profile_id AND pa.bidder_id = p_user_id
    );
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Not authorized to view missed jobs for this profile';
  END IF;

  IF p_date_range = 'today' THEN
    v_start_date := date_trunc('day', CURRENT_DATE);
    v_end_date := v_start_date + interval '23:59:59';
  ELSE
    v_start_date := date_trunc('week', CURRENT_DATE);
    v_end_date := v_start_date + interval '6 days 23:59:59';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM (
    SELECT DISTINCT lower(btrim(ja.company_name)) AS company_key
    FROM job_applications ja
    WHERE ja.profile_id <> p_profile_id
      AND ja.company_name IS NOT NULL
      AND btrim(ja.company_name) <> ''
      AND ja.job_description_link IS NOT NULL
      AND btrim(ja.job_description_link) <> ''
      AND ja.created_at >= v_start_date
      AND ja.created_at <= v_end_date
      AND NOT EXISTS (
        SELECT 1
        FROM job_applications mine
        WHERE mine.profile_id = p_profile_id
          AND mine.status = 'active'
          AND mine.company_name IS NOT NULL
          AND lower(btrim(mine.company_name)) = lower(btrim(ja.company_name))
      )
  ) src;

  RETURN COALESCE(v_count, 0);
END; $$;

GRANT EXECUTE ON FUNCTION get_missed_job_applications(UUID, user_role, UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_missed_job_applications_count(UUID, user_role, UUID, TEXT) TO authenticated;

SELECT 'Missed job applications RPCs created successfully!' AS status;
