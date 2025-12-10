-- Drop the restrictive policy
DROP POLICY IF EXISTS "Users can insert centers" ON public.centers;

-- Create policy AS PERMISSIVE (this is the default and correct behavior)
CREATE POLICY "Users can insert centers"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) 
  OR get_user_center_id(auth.uid()) IS NULL
);