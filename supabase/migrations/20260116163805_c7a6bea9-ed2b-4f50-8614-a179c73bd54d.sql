-- Create integration_errors table for structured error logging
CREATE TABLE IF NOT EXISTS public.integration_errors (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'google',
  source text NOT NULL, -- sync-google-calendar, google-calendar-webhook, oauth-callback, ui
  step text, -- refresh_token, events.list, events.insert, events.update, watch, stop
  at timestamptz NOT NULL DEFAULT now(),
  http_status integer,
  error_code text,
  message text,
  raw jsonb, -- sanitized error payload
  correlation_id text, -- to group related errors
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX idx_integration_errors_professional_id ON public.integration_errors(professional_id);
CREATE INDEX idx_integration_errors_provider ON public.integration_errors(provider);
CREATE INDEX idx_integration_errors_at ON public.integration_errors(at DESC);
CREATE INDEX idx_integration_errors_correlation_id ON public.integration_errors(correlation_id) WHERE correlation_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only see their own errors
CREATE POLICY "Users can view their own integration errors"
  ON public.integration_errors
  FOR SELECT
  USING (professional_id = auth.uid());

-- Service role can insert (for edge functions)
CREATE POLICY "Service role can insert integration errors"
  ON public.integration_errors
  FOR INSERT
  WITH CHECK (true);

-- Add new columns to oauth_connections for better error tracking
ALTER TABLE public.oauth_connections 
  ADD COLUMN IF NOT EXISTS last_sync_error_code text,
  ADD COLUMN IF NOT EXISTS last_sync_error_message text,
  ADD COLUMN IF NOT EXISTS last_sync_error_raw jsonb,
  ADD COLUMN IF NOT EXISTS last_token_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_token_refresh_result text,
  ADD COLUMN IF NOT EXISTS last_webhook_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_token_last_set_at timestamptz;

-- Create function to sanitize error payloads (remove tokens/secrets)
CREATE OR REPLACE FUNCTION public.sanitize_error_payload(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sanitized jsonb;
  sensitive_keys text[] := ARRAY[
    'access_token', 'refresh_token', 'client_secret', 'authorization_code',
    'id_token', 'code', 'token', 'secret', 'password', 'key', 'apikey',
    'api_key', 'bearer', 'credential', 'credentials'
  ];
  k text;
BEGIN
  IF payload IS NULL THEN
    RETURN NULL;
  END IF;
  
  sanitized := payload;
  
  -- Remove sensitive keys at top level
  FOREACH k IN ARRAY sensitive_keys LOOP
    IF sanitized ? k THEN
      sanitized := sanitized - k;
      sanitized := sanitized || jsonb_build_object(k, '[REDACTED]');
    END IF;
  END LOOP;
  
  RETURN sanitized;
END;
$$;

-- Create function to log integration error (for use in edge functions via RPC)
CREATE OR REPLACE FUNCTION public.log_integration_error(
  p_professional_id uuid,
  p_provider text,
  p_source text,
  p_step text DEFAULT NULL,
  p_http_status integer DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_raw jsonb DEFAULT NULL,
  p_correlation_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_error_id uuid;
BEGIN
  INSERT INTO public.integration_errors (
    professional_id,
    provider,
    source,
    step,
    http_status,
    error_code,
    message,
    raw,
    correlation_id
  ) VALUES (
    p_professional_id,
    p_provider,
    p_source,
    p_step,
    p_http_status,
    p_error_code,
    p_message,
    public.sanitize_error_payload(p_raw),
    p_correlation_id
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$$;