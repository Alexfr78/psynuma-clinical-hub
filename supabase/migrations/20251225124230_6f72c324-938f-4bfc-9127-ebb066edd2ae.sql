-- Fix centers RLS policies for new user flow
-- Problem: is_admin() now requires center_id, breaking new user center creation

-- Drop problematic policies
DROP POLICY IF EXISTS "Users can view their center" ON public.centers;
DROP POLICY IF EXISTS "Users can insert centers" ON public.centers;

-- Policy for inserting: users without a center can create one
CREATE POLICY "Users can create their first center"
ON public.centers
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_create_center(auth.uid()));

-- Policy for viewing: users can see their own center OR the center they just created
-- We need to allow seeing a center if:
-- 1. It's their assigned center (profile.center_id = centers.id)
-- 2. OR they are admin of that center (after wizard completes)
CREATE POLICY "Users can view their center"
ON public.centers
FOR SELECT
TO authenticated
USING (
  id = public.get_user_center_id(auth.uid())
  OR public.has_role_in_center(auth.uid(), 'admin'::public.app_role, id)
);