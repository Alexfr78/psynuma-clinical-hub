BEGIN;

-- Drop the overly permissive SELECT policy that allows any authenticated center user to read the full centers row.
DROP POLICY IF EXISTS "Professionals can view their center" ON public.centers;

-- Restrict direct SELECT on centers to admins only.
-- Non-admin users must use the get_safe_center RPC, which masks sensitive credential columns.
CREATE POLICY "Admins can view their center"
  ON public.centers FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND id = public.get_user_center_id(auth.uid())
  );

-- Ensure base grants are in place for the policy to apply.
GRANT SELECT ON public.centers TO authenticated;
GRANT ALL ON public.centers TO service_role;

COMMIT;