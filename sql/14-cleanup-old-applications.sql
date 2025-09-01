-- Enable the pg_cron extension (requires superuser privileges)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to clean up old job applications
-- This function removes applications older than 1 month (30 days)
CREATE OR REPLACE FUNCTION cleanup_old_job_applications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate the cutoff date (1 month ago)
    cutoff_date := NOW() - INTERVAL '1 month';
    
    -- Delete old job applications
    DELETE FROM job_applications 
    WHERE created_at < cutoff_date;
    
    -- Get the count of deleted records
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log the cleanup operation
    RAISE NOTICE 'Cleaned up % old job applications older than %', deleted_count, cutoff_date;
    
    RETURN deleted_count;
END;
$$;

-- Create a cron job that runs the cleanup function every day at 2:00 AM
SELECT cron.schedule(
    'cleanup-old-applications-daily',
    '0 2 * * *',  -- Cron expression: every day at 2:00 AM
    'SELECT cleanup_old_job_applications();'
);