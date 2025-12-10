-- Drop the restrictive admin policy that blocks new users
DROP POLICY IF EXISTS "Admins can manage centers" ON public.centers;

-- Drop my previous policy attempt
DROP POLICY IF EXISTS "Users can create their first center" ON public.centers;

-- Create a combined permissive policy for INSERT that allows both admins and first-time setup
CREATE POLICY "Users can insert centers"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (
  is_admin(auth.uid()) 
  OR (SELECT center_id FROM public.profiles WHERE id = auth.uid()) IS NULL
);

-- Create policy for UPDATE/DELETE only for admins
CREATE POLICY "Admins can update and delete centers"
ON public.centers
FOR ALL
TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));