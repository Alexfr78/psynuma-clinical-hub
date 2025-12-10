-- Drop the ALL policy that's conflicting
DROP POLICY IF EXISTS "Admins can update and delete centers" ON public.centers;

-- Create separate policies for UPDATE and DELETE only
CREATE POLICY "Admins can update centers"
ON public.centers
FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete centers"
ON public.centers
FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));