-- Public booking uses clickwrap acceptance rather than a drawn signature.
-- Consent verification fields are indexed as string keys ("0", "1", ...).
-- Backfill the first affirmative response for clickwrap consents created before
-- the edge function began storing that canonical shape.
UPDATE public.consents
SET verification_responses = jsonb_set(
  COALESCE(verification_responses, '{}'::jsonb),
  '{0}',
  'true'::jsonb,
  true
)
WHERE source = 'public_booking_checkbox'
  AND status = 'signed'
  AND cancellation_policy_version_id IS NOT NULL
  AND COALESCE(verification_responses ->> 'accepted', 'false') = 'true'
  AND COALESCE(verification_responses ->> '0', 'false') <> 'true';
