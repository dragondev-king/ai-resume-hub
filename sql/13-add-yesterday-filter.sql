-- Add "yesterday" date range filter to job applications
-- This migration updates the filtering functions to support yesterday date range

-- Update the get_job_applications_with_filters function to include yesterday filter
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
  bidder_first_name TEXT, bidder_last_name TEXT, bidder_email TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
DECLARE v_start_date TIMESTAMP WITH TIME ZONE;
DECLARE v_end_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get profile IDs for role-based filtering
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    -- For bidders, we'll filter by bidder_id in the main query
    v_profile_ids := NULL;
  END IF;

  -- Calculate date range if specified
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
    b.first_name as bidder_first_name, b.last_name as bidder_last_name, b.email as bidder_email
  FROM job_applications ja
  JOIN profiles p ON ja.profile_id = p.id
  JOIN users b ON ja.bidder_id = b.id
  WHERE 
    -- Role-based filtering
    ((p_user_role = 'admin') OR 
     (p_user_role = 'manager' AND ja.profile_id = ANY(v_profile_ids)) OR 
     (p_user_role = 'bidder' AND ja.bidder_id = p_user_id))
    -- Additional filters
    AND (p_profile_id IS NULL OR ja.profile_id = p_profile_id)
    AND (p_bidder_id IS NULL OR ja.bidder_id = p_bidder_id)
    AND (p_status IS NULL OR ja.status = p_status)
    AND (p_company_name IS NULL OR ja.company_name ILIKE '%' || p_company_name || '%')
    AND (v_start_date IS NULL OR ja.created_at >= v_start_date)
    AND (v_end_date IS NULL OR ja.created_at <= v_end_date)
  ORDER BY ja.created_at DESC
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END; $$;

-- Update the count function to include yesterday filter
CREATE OR REPLACE FUNCTION get_job_applications_count(
  p_user_id UUID, 
  p_user_role user_role,
  p_profile_id UUID DEFAULT NULL,
  p_bidder_id UUID DEFAULT NULL,
  p_date_from TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_to TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_date_range TEXT DEFAULT 'all',
  p_status application_status DEFAULT NULL,
  p_company_name TEXT DEFAULT NULL
)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
DECLARE v_start_date TIMESTAMP WITH TIME ZONE;
DECLARE v_end_date TIMESTAMP WITH TIME ZONE;
DECLARE v_count INTEGER;
BEGIN
  -- Get profile IDs for role-based filtering
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    -- For bidders, we'll filter by bidder_id in the main query
    v_profile_ids := NULL;
  END IF;

  -- Calculate date range if specified
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

  SELECT COUNT(*) INTO v_count
  FROM job_applications ja
  JOIN profiles p ON ja.profile_id = p.id
  JOIN users b ON ja.bidder_id = b.id
  WHERE 
    -- Role-based filtering
    ((p_user_role = 'admin') OR 
     (p_user_role = 'manager' AND ja.profile_id = ANY(v_profile_ids)) OR 
     (p_user_role = 'bidder' AND ja.bidder_id = p_user_id))
    -- Additional filters
    AND (p_profile_id IS NULL OR ja.profile_id = p_profile_id)
    AND (p_bidder_id IS NULL OR ja.bidder_id = p_bidder_id)
    AND (p_status IS NULL OR ja.status = p_status)
    AND (p_company_name IS NULL OR ja.company_name ILIKE '%' || p_company_name || '%')
    AND (v_start_date IS NULL OR ja.created_at >= v_start_date)
    AND (v_end_date IS NULL OR ja.created_at <= v_end_date);

  RETURN v_count;
END; $$;

-- Grant execute permissions on the updated functions
GRANT EXECUTE ON FUNCTION get_job_applications_with_filters(UUID, user_role, UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, application_status, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_job_applications_count(UUID, user_role, UUID, UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, TEXT, application_status, TEXT) TO authenticated;
