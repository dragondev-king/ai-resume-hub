-- =====================================================
-- 23. MISSED JOB APPLICATIONS
-- =====================================================
-- Other profiles' linked applications in the selected window, excluding
-- companies this profile already has an active application to.
-- Company match is the same as duplicate-application checks: exact company_name.
--
-- Queries run via EXECUTE so RETURNS TABLE names (id, company_name, …) cannot
-- shadow job_applications columns.
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
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_allowed BOOLEAN := FALSE;
  v_start_date TIMESTAMP WITH TIME ZONE;
  v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_role = 'admin' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles AS p WHERE p.id = p_profile_id);
  ELSIF p_user_role = 'manager' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles AS p WHERE p.id = p_profile_id AND p.user_id = p_user_id);
  ELSIF p_user_role = 'bidder' THEN
    v_allowed := EXISTS (
      SELECT 1 FROM profile_assignments AS pa
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

  RETURN QUERY EXECUTE
    $q$
    SELECT
      src.application_id,
      src.out_company_name,
      src.out_job_title,
      src.out_job_link,
      src.out_created_at
    FROM (
      SELECT DISTINCT ON (o.company_name)
        o.id AS application_id,
        o.company_name AS out_company_name,
        o.job_title AS out_job_title,
        o.job_description_link AS out_job_link,
        o.created_at AS out_created_at
      FROM job_applications AS o
      WHERE o.profile_id <> $1
        AND o.company_name IS NOT NULL
        AND btrim(o.company_name) <> ''
        AND o.job_description_link IS NOT NULL
        AND btrim(o.job_description_link) <> ''
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND NOT EXISTS (
          SELECT 1
          FROM job_applications AS m
          WHERE m.profile_id = $1
            AND m.status = 'active'
            AND m.company_name = o.company_name
        )
      ORDER BY o.company_name, o.created_at DESC
    ) src
    ORDER BY src.out_created_at DESC
    LIMIT $4
    OFFSET $5
    $q$
  USING
    p_profile_id,
    v_start_date,
    v_end_date,
    p_page_size,
    (p_page_number - 1) * p_page_size;
END; $$;

CREATE OR REPLACE FUNCTION get_missed_job_applications_count(
  p_user_id UUID,
  p_user_role user_role,
  p_profile_id UUID,
  p_date_range TEXT DEFAULT 'this-week'
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    v_allowed := EXISTS (SELECT 1 FROM profiles AS p WHERE p.id = p_profile_id);
  ELSIF p_user_role = 'manager' THEN
    v_allowed := EXISTS (SELECT 1 FROM profiles AS p WHERE p.id = p_profile_id AND p.user_id = p_user_id);
  ELSIF p_user_role = 'bidder' THEN
    v_allowed := EXISTS (
      SELECT 1 FROM profile_assignments AS pa
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

  EXECUTE
    $q$
    SELECT COUNT(*)::INTEGER
    FROM (
      SELECT DISTINCT o.company_name
      FROM job_applications AS o
      WHERE o.profile_id <> $1
        AND o.company_name IS NOT NULL
        AND btrim(o.company_name) <> ''
        AND o.job_description_link IS NOT NULL
        AND btrim(o.job_description_link) <> ''
        AND o.created_at >= $2
        AND o.created_at <= $3
        AND NOT EXISTS (
          SELECT 1
          FROM job_applications AS m
          WHERE m.profile_id = $1
            AND m.status = 'active'
            AND m.company_name = o.company_name
        )
    ) src
    $q$
  INTO v_count
  USING p_profile_id, v_start_date, v_end_date;

  RETURN COALESCE(v_count, 0);
END; $$;

GRANT EXECUTE ON FUNCTION get_missed_job_applications(UUID, user_role, UUID, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_missed_job_applications_count(UUID, user_role, UUID, TEXT) TO authenticated;

SELECT 'Missed job applications RPCs created successfully!' AS status;
