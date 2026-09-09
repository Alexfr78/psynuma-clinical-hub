-- Drop the problematic policy with direct subquery
DROP POLICY IF EXISTS "Users can insert centers" ON public.centers;

-- Create corrected policy using SECURITY DEFINER function
CREATE POLICY "Users can insert centers"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) 
  OR get_user_center_id(auth.uid()) IS NULL
);