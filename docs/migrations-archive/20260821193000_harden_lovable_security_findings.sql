-- Harden the two actionable findings from Lovable's security scan.

-- Audit log reads are for authenticated admins in the same center only.
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
ON public.audit_log
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND user_id IN (
    SELECT id
    FROM public.profiles
    WHERE center_id = public.get_user_center_id(auth.uid())
  )
);

-- Public consent flows only need to save verification responses directly.
-- Emergency contact changes already go through the token-validating Edge Function.
DROP POLICY IF EXISTS "Anon update consent by valid token" ON public.consents;
CREATE POLICY "Anon update consent by valid token"
ON public.consents
FOR UPDATE
TO anon
USING (
  access_token IS NOT NULL
  AND access_token = public.get_consent_token()
)
WITH CHECK (
  access_token IS NOT NULL
  AND access_token = public.get_consent_token()
);

REVOKE UPDATE ON public.consents FROM anon;
GRANT UPDATE (verification_responses) ON public.consents TO anon;
