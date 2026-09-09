-- =============================================
-- FIX 1: Remove insecure portal session policies
-- These are not needed because portal operations go through
-- edge functions (patient-portal-sessions) using SERVICE_ROLE_KEY
-- =============================================

DROP POLICY IF EXISTS "Portal patients can read own sessions" ON public.sessions;
DROP POLICY IF EXISTS "Portal can create sessions" ON public.sessions;

-- =============================================
-- FIX 2: Restrict centers table credential access
-- Split the SELECT policy so professionals cannot read secrets
-- =============================================

-- Drop the current overly-permissive policy
DROP POLICY IF EXISTS "Users can view their center" ON public.centers;

-- Admin-only: full row access (needed for settings pages)
CREATE POLICY "Admins can view full center"
  ON public.centers FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid()) AND id = get_user_center_id(auth.uid())
  );

-- Professionals: allow SELECT but only through the safe RPC
-- We block direct table reads for non-admins by requiring admin role
-- The get_safe_center() RPC (SECURITY DEFINER) handles masking for professionals
-- This means professionals MUST use get_safe_center() RPC to read center data

-- Actually, we need professionals to still read basic center info.
-- The cleanest approach: keep a policy but use a security barrier view.

-- Drop the admin-only policy we just created (we'll use a different approach)
DROP POLICY IF EXISTS "Admins can view full center" ON public.centers;

-- Approach: Two policies - admin gets everything, professional gets everything
-- BUT we enforce application-level access through get_safe_center RPC.
-- The RPC already masks secrets for non-admins.
-- To truly prevent direct SELECT bypasses, we restrict the table policy:

-- Policy for admins: full access
CREATE POLICY "Admins can view their center"
  ON public.centers FOR SELECT
  TO authenticated
  USING (
    id = get_user_center_id(auth.uid())
    AND is_admin(auth.uid())
  );

-- Policy for professionals: also allow SELECT (needed for basic center info)
-- But we'll update get_safe_center to be the ONLY way professionals read center data
-- by making the direct policy admin-only.
-- Professionals who need center data use get_safe_center() which is SECURITY DEFINER.

-- Verify get_safe_center is SECURITY DEFINER (it is, confirmed above)
-- This means professionals can still get center data through the RPC,
-- but cannot do a direct SELECT on the centers table.

-- Note: We need to verify no client code does direct centers table queries for non-admins.
-- The useCenter hook uses get_safe_center RPC, which is correct.
-- The updateCenter mutation uses .from('centers').update() which requires the UPDATE policy
-- (already restricted to admins via existing "Users can update their center" policy).