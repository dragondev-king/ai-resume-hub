-- =====================================================
-- 05. CREATE USER SYNC TRIGGER - SIMPLE SETUP
-- =====================================================

-- Create simple trigger function to sync users
CREATE OR REPLACE FUNCTION sync_user_to_public()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    BEGIN
      INSERT INTO public.users (id, email, first_name, last_name, role, is_active)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        'bidder',
        true
      );
      RAISE NOTICE 'Successfully synced user % to public.users', NEW.email;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Failed to sync user % to public.users: %', NEW.email, SQLERRM;
        RETURN NEW;
    END;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER sync_user_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_to_public();

SELECT 'User sync trigger created successfully!' as status; 