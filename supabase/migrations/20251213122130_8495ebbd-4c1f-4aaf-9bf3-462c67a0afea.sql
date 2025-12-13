-- Add columns for storing Client IDs in plaintext (not sensitive)
-- Secrets are already stored encrypted in the existing oauth_*_credentials columns

ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS oauth_google_client_id TEXT;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS oauth_zoom_client_id TEXT;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS oauth_stripe_publishable_key TEXT;