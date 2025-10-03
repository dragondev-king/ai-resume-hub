-- =====================================================
-- 16. APPLICATION SUMMARY FUNCTIONS
-- =====================================================
-- This creates functions to get application summaries for the home page dashboard

-- Function to get application summaries by profile
CREATE OR REPLACE FUNCTION get_application_summaries_by_profile(
  p_user_id UUID, 
  p_user_role user_role
)
RETURNS TABLE (
  profile_id UUID,
  profile_first_name TEXT,
  profile_last_name TEXT,
  profile_email TEXT,
  owner_first_name TEXT,
  owner_last_name TEXT,
  owner_email TEXT,
  assigned_bidders TEXT,
  today_applications INTEGER,
  this_week_applications INTEGER,
  this_month_applications INTEGER
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile_ids UUID[];
BEGIN
  -- Get profile IDs for role-based filtering
  IF p_user_role = 'manager' THEN
    SELECT ARRAY_AGG(p.id) INTO v_profile_ids FROM profiles p WHERE p.user_id = p_user_id;
  ELSIF p_user_role = 'bidder' THEN
    -- For bidders, get profiles they're assigned to
    SELECT ARRAY_AGG(pa.profile_id) INTO v_profile_ids FROM profile_assignments pa WHERE pa.bidder_id = p_user_id;
  END IF;

  RETURN QUERY
  SELECT 
    p.id as profile_id,
    p.first_name as profile_first_name,
    p.last_name as profile_last_name,
    p.email as profile_email,
    u.first_name as owner_first_name,
    u.last_name as owner_last_name,
    u.email as owner_email,
    COALESCE(
      (SELECT string_agg(u_bidder.first_name || ' ' || u_bidder.last_name, ', ')
       FROM profile_assignments pa 
       JOIN users u_bidder ON pa.bidder_id = u_bidder.id 
       WHERE pa.profile_id = p.id), 
      'No bidders assigned'
    ) as assigned_bidders,
    COUNT(CASE WHEN ja.created_at >= date_trunc('day', CURRENT_DATE) AND ja.created_at < date_trunc('day', CURRENT_DATE + interval '1 day') THEN 1 END)::INTEGER as today_applications,
    COUNT(CASE WHEN ja.created_at >= date_trunc('week', CURRENT_DATE) AND ja.created_at < date_trunc('week', CURRENT_DATE + interval '1 week') THEN 1 END)::INTEGER as this_week_applications,
    COUNT(CASE WHEN ja.created_at >= date_trunc('month', CURRENT_DATE) AND ja.created_at < date_trunc('month', CURRENT_DATE + interval '1 month') THEN 1 END)::INTEGER as this_month_applications
  FROM profiles p
  LEFT JOIN users u ON p.user_id = u.id
  LEFT JOIN job_applications ja ON p.id = ja.profile_id
  WHERE 
    -- Role-based filtering
    ((p_user_role = 'admin') OR 
     (p_user_role = 'manager' AND p.id = ANY(v_profile_ids)) OR 
     (p_user_role = 'bidder' AND p.id = ANY(v_profile_ids)))
  GROUP BY p.id, p.first_name, p.last_name, p.email, u.first_name, u.last_name, u.email
  ORDER BY this_week_applications DESC, this_month_applications DESC, today_applications DESC, p.first_name, p.last_name;
END; $$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_application_summaries_by_profile(UUID, user_role) TO authenticated;

SELECT 'Application summary functions created successfully!' as status;
