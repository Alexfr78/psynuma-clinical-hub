
-- Add RLS policies for patient_magic_links table
-- This table stores magic link tokens for patient portal authentication
-- Only service_role should be able to manage these (via edge functions)

-- Policy for service role to manage all magic links
CREATE POLICY "Service role can manage magic links"
ON public.patient_magic_links
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy for authenticated professionals to view magic links for their center
-- This allows the admin interface to display pending/used magic links if needed
CREATE POLICY "Professionals can view their center magic links"
ON public.patient_magic_links
FOR SELECT
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
);
