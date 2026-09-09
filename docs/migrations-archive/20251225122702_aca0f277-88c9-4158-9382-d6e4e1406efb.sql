-- Fix user_can_create_center function to not depend on is_admin() 
-- which now requires center_id (causing circular dependency for new users)
CREATE OR REPLACE FUNCTION public.user_can_create_center(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Allow if user doesn't have a center assigned yet
  -- (either no profile exists, or profile has NULL center_id)
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = _user_id 
    AND center_id IS NOT NULL
  );
$$;