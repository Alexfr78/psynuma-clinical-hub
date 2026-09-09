-- Add consecutive_sync_errors column to track persistent sync failures
ALTER TABLE public.oauth_connections 
ADD COLUMN IF NOT EXISTS consecutive_sync_errors INTEGER DEFAULT 0;