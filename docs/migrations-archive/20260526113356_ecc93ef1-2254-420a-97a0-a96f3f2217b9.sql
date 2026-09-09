
-- 1. Remove overly permissive consent_templates public SELECT policy.
-- The anon token-verified policy ("Anon read template by valid consent token")
-- already covers legitimate public access via verify_consent_token_for_template.
DROP POLICY IF EXISTS "Public read template via consent token" ON public.consent_templates;

-- 2. Remove publicly readable patients policy. Patient portal access flows
-- through edge functions (patient-portal-auth / patient-portal-sessions /
-- patient-portal-invoices) using service_role + HMAC tokens, so patients no
-- longer need direct anon/public SELECT on the patients table.
DROP POLICY IF EXISTS "Portal patients can read own data" ON public.patients;

-- 3. Scope patient_portal_accounts management to the user's own center.
DROP POLICY IF EXISTS "Admins and professionals can manage portal accounts" ON public.patient_portal_accounts;

CREATE POLICY "Admins and professionals can manage portal accounts in center"
ON public.patient_portal_accounts
FOR ALL
TO authenticated
USING (
  (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND patient_id IN (
    SELECT id FROM public.patients
    WHERE center_id = get_user_center_id(auth.uid())
  )
)
WITH CHECK (
  (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND patient_id IN (
    SELECT id FROM public.patients
    WHERE center_id = get_user_center_id(auth.uid())
  )
);
