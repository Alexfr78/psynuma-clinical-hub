-- Add columns for OAuth credentials storage in centers table
ALTER TABLE public.centers 
ADD COLUMN IF NOT EXISTS oauth_google_credentials TEXT,
ADD COLUMN IF NOT EXISTS oauth_zoom_credentials TEXT,
ADD COLUMN IF NOT EXISTS oauth_stripe_credentials TEXT;