DROP POLICY IF EXISTS "Anyone can submit a referral request"
  ON public.referral_partner_requests;

CREATE POLICY "Anon can submit referral with required fields"
  ON public.referral_partner_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    center_id IS NOT NULL
    AND length(trim(name)) > 0
    AND length(trim(email)) > 0
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND privacy_accepted = true
    AND status = 'pending'
  );