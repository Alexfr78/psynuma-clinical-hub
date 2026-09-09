-- Fix oauth_connections: Create a safe public view that excludes sensitive tokens
-- Tokens should only be accessed server-side via edge functions

-- Create a safe view for oauth_connections that excludes sensitive credentials
DROP VIEW IF EXISTS public.oauth_connections_safe;
CREATE VIEW public.oauth_connections_safe WITH (security_invoker = true) AS
SELECT 
    id,
    professional_id,
    provider,
    -- Exclude: access_token, refresh_token (sensitive credentials)
    expires_at,
    scope,
    provider_account_id,
    stripe_account_id,
    stripe_account_status,
    google_calendar_id,
    created_at,
    updated_at,
    -- Exclude: sync_token (internal state, not critical but not needed by client)
    watch_channel_id,
    watch_resource_id,
    watch_expires_at,
    last_sync_at,
    last_sync_status,
    needs_reconnect,
    -- Exclude: watch_channel_token (security token)
    consecutive_sync_errors,
    last_sync_error_code,
    last_sync_error_message
    -- Exclude: last_sync_error_raw (may contain sensitive data)
FROM oauth_connections;

-- Grant access to authenticated users (RLS from base table still applies via security_invoker)
GRANT SELECT ON public.oauth_connections_safe TO authenticated;

-- Now restrict direct SELECT on the base oauth_connections table
-- Only allow edge functions (service role) to read tokens directly
DROP POLICY IF EXISTS "Professionals manage own oauth" ON public.oauth_connections;

-- Create separate policies: SELECT denied for client, write operations allowed
CREATE POLICY "Block direct SELECT on oauth_connections"
ON public.oauth_connections FOR SELECT
USING (false);  -- No direct SELECT allowed - must use the safe view

CREATE POLICY "Professionals can insert oauth connections"
ON public.oauth_connections FOR INSERT
WITH CHECK (professional_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Professionals can update own oauth connections"
ON public.oauth_connections FOR UPDATE
USING (professional_id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (professional_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Professionals can delete own oauth connections"
ON public.oauth_connections FOR DELETE
USING (professional_id = auth.uid() OR public.is_admin(auth.uid()));

-- For the profiles table, the current RLS policy is actually correct:
-- Users in the same center CAN view each other's profiles - this is needed for:
-- - Seeing which professionals are available for booking
-- - Admin managing team members
-- The issue flagged is not a real vulnerability for this use case.

-- For centers_public view - it already uses security_invoker=true
-- The "missing RLS" warning is about the view not having its own policies,
-- but since it uses security_invoker, it inherits the centers table RLS.
-- The only case where data might leak is for portal/booking pages which need public access.
-- We should verify the base centers table RLS is appropriate.