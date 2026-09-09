-- Fix the overly permissive INSERT policy by restricting to service role
DROP POLICY IF EXISTS "Service role can insert integration errors" ON public.integration_errors;

-- Create a more restrictive policy - only authenticated users can insert their own errors
-- or via database functions (SECURITY DEFINER)
CREATE POLICY "Users can insert their own integration errors"
  ON public.integration_errors
  FOR INSERT
  WITH CHECK (professional_id = auth.uid());

-- The log_integration_error function uses SECURITY DEFINER so it bypasses RLS
-- This is the intended pattern for edge functions to log errors