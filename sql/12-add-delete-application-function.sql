-- =====================================================
-- 12. ADD DELETE APPLICATION FUNCTION
-- =====================================================
-- This adds a function to delete job applications (admin/manager only)

-- Function to delete a job application
CREATE OR REPLACE FUNCTION delete_job_application(p_application_id UUID, p_user_id UUID, p_user_role TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_application_exists BOOLEAN;
BEGIN
  -- Check if user has permission to delete (admin or manager only)
  IF p_user_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Insufficient permissions. Only admins and managers can delete applications.';
  END IF;

  -- Check if application exists
  SELECT EXISTS(SELECT 1 FROM job_applications WHERE id = p_application_id) INTO v_application_exists;
  
  IF NOT v_application_exists THEN
    RAISE EXCEPTION 'Application not found.';
  END IF;

  -- Delete the application
  DELETE FROM job_applications WHERE id = p_application_id;
  
  RETURN TRUE;
END; $$;

-- Grant permissions for the delete function
GRANT EXECUTE ON FUNCTION delete_job_application(UUID, UUID, TEXT) TO authenticated;

SELECT 'Delete application function created successfully!' as status; 