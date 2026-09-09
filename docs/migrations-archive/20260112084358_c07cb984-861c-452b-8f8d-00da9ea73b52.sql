-- Fix 1: audit_log_insert_bypass (CRITICAL)
-- Drop the overly permissive policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "System can insert audit log" ON public.audit_log;

-- Create a service_role only policy for audit log inserts
CREATE POLICY "Service role can insert audit log" 
ON public.audit_log
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Fix 2: service_role_policy_scope - verifactu_events
-- Drop and recreate with proper role restriction
DROP POLICY IF EXISTS "Service role can manage verifactu events" ON public.verifactu_events;
CREATE POLICY "Service role can manage verifactu events"
ON public.verifactu_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Fix 3: service_role_policy_scope - assessment_responses
-- Drop and recreate with proper role restriction  
DROP POLICY IF EXISTS "Service role can insert responses" ON public.assessment_responses;
CREATE POLICY "Service role can insert responses"
ON public.assessment_responses 
FOR INSERT
TO service_role
WITH CHECK (true);

-- Fix 4: google_channels_rls_config
-- Drop any overly permissive policies
DROP POLICY IF EXISTS "Service role manages channels" ON public.google_calendar_channels;

-- Create properly scoped service role policy
CREATE POLICY "Service role manages channels"
ON public.google_calendar_channels
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Keep professional-scoped policies (they should already exist)
DROP POLICY IF EXISTS "Professional read own channels" ON public.google_calendar_channels;
DROP POLICY IF EXISTS "Professional insert own channels" ON public.google_calendar_channels;
DROP POLICY IF EXISTS "Professional delete own channels" ON public.google_calendar_channels;

CREATE POLICY "Professional read own channels" 
ON public.google_calendar_channels
FOR SELECT
TO authenticated
USING (professional_id = auth.uid());

CREATE POLICY "Professional insert own channels" 
ON public.google_calendar_channels
FOR INSERT
TO authenticated
WITH CHECK (professional_id = auth.uid());

CREATE POLICY "Professional delete own channels" 
ON public.google_calendar_channels
FOR DELETE
TO authenticated
USING (professional_id = auth.uid());

-- Fix 5: Add watch_channel_token column for Google webhook token verification
ALTER TABLE public.oauth_connections 
ADD COLUMN IF NOT EXISTS watch_channel_token TEXT;