-- A signed clickwrap remains valid for the exact policy version until it is
-- revoked or a newer cancellation-policy version needs to be accepted.
-- expires_at is the deadline for unsigned invitations, not an expiry date for
-- an acceptance that has already been recorded.
BEGIN;

ALTER TABLE public.consents
  ALTER COLUMN expires_at DROP NOT NULL;

-- Lovable's SQL editor does not provide auth.uid(), so the public-update
-- protection trigger would otherwise treat this controlled migration as an
-- anonymous request. Disable only that trigger for the data correction.
ALTER TABLE public.consents
  DISABLE TRIGGER trg_protect_consent_anon_update;

UPDATE public.consents
SET expires_at = NULL,
    updated_at = now()
WHERE status = 'signed'
  AND source IN ('public_booking_checkbox', 'portal_booking_checkbox')
  AND cancellation_policy_version_id IS NOT NULL;

ALTER TABLE public.consents
  ENABLE TRIGGER trg_protect_consent_anon_update;

COMMIT;
