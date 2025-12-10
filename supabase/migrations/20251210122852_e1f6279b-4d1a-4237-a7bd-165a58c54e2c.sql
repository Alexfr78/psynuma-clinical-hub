-- Create a robust helper function for checking if user can create a center
CREATE OR REPLACE FUNCTION public.user_can_create_center(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  user_center_id uuid;
BEGIN
  -- Get the user's current center_id from profiles
  SELECT center_id INTO user_center_id
  FROM public.profiles
  WHERE id = _user_id;
  
  -- User can create center if: they're admin OR they don't have a center yet
  IF public.is_admin(_user_id) THEN
    RETURN TRUE;
  END IF;
  
  -- Allow if user has no center (NULL center_id or no profile)
  RETURN user_center_id IS NULL;
END;
$$;

-- Drop and recreate the policy with the new function
DROP POLICY IF EXISTS "Users can insert centers" ON public.centers;

CREATE POLICY "Users can insert centers"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_create_center(auth.uid()));