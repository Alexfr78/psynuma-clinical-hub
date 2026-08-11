-- A signed clickwrap remains valid for the exact policy version until it is
-- revoked or a newer cancellation-policy version needs to be accepted.
-- expires_at is the deadline for unsigned invitations, not an expiry date for
-- an acceptance that has already been recorded.
ALTER TABLE public.consents
  ALTER COLUMN expires_at DROP NOT NULL;

UPDATE public.consents
SET expires_at = NULL,
    updated_at = now()
WHERE status = 'signed'
  AND source IN ('public_booking_checkbox', 'portal_booking_checkbox')
  AND cancellation_policy_version_id IS NOT NULL;
