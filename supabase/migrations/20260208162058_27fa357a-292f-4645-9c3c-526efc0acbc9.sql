-- Fix permissive RLS policies flagged by linter

-- 1) google_sync_debounce: was incorrectly allowing ALL actions to PUBLIC with USING/WITH CHECK true
DROP POLICY IF EXISTS "Service role full access on google_sync_debounce" ON public.google_sync_debounce;

CREATE POLICY "Service role full access on google_sync_debounce"
ON public.google_sync_debounce
FOR ALL
TO service_role
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 2) portal_intake_requests: keep public (anon) submissions, but restrict what can be inserted
--    (prevents anon users from setting arbitrary status)
DROP POLICY IF EXISTS "Allow anon insert for public submissions" ON public.portal_intake_requests;

CREATE POLICY "Allow anon insert for public submissions"
ON public.portal_intake_requests
FOR INSERT
TO anon
WITH CHECK (
  center_id IS NOT NULL
  AND request_type IS NOT NULL
  AND length(trim(first_name)) > 0
  AND length(trim(last_name)) > 0
  AND length(trim(email)) > 0
  AND status = 'pending'
);