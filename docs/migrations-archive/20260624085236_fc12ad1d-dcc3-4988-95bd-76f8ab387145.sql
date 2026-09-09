
-- 1. CENTERS: revoke direct SELECT on sensitive columns from authenticated.
--    Admins still read them via get_safe_center (SECURITY DEFINER).
REVOKE SELECT (
  verifactu_certificate_base64,
  verifactu_certificate_password,
  openai_api_key_encrypted,
  gemini_api_key_encrypted,
  whatsapp_access_token,
  oauth_google_credentials,
  oauth_zoom_credentials,
  oauth_stripe_credentials
) ON public.centers FROM authenticated, anon;

-- Update get_safe_center to also mask AI API keys for non-admins
CREATE OR REPLACE FUNCTION public.get_safe_center(p_center_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_center_id != public.get_user_center_id(auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(c) INTO v_result FROM public.centers c WHERE c.id = p_center_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    v_result := v_result
      - 'verifactu_certificate_base64'
      - 'verifactu_certificate_password'
      - 'whatsapp_access_token'
      - 'oauth_google_credentials'
      - 'oauth_zoom_credentials'
      - 'oauth_stripe_credentials'
      - 'openai_api_key_encrypted'
      - 'gemini_api_key_encrypted';
  END IF;

  RETURN v_result;
END;
$function$;

-- 2. WHATSAPP_SESSIONS: revoke direct SELECT on credential columns from authenticated.
REVOKE SELECT (api_key, webhook_secret) ON public.whatsapp_sessions FROM authenticated, anon;

-- 3. OAUTH_CONNECTIONS: remove direct SELECT for authenticated.
--    Client code reads via oauth_connections_safe view (excludes tokens).
--    UPDATE/DELETE policies remain so disconnect flows still work; edge functions use service_role.
DROP POLICY IF EXISTS "Professionals can select own oauth connections" ON public.oauth_connections;

-- 4. EMAIL_* tables: drop non-functional auth.role()='service_role' policies (service_role bypasses RLS).
--    Keep RLS enabled so non-service_role callers get default deny.
DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;

DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;

COMMENT ON TABLE public.email_unsubscribe_tokens IS 'Service-role only. RLS enabled with no policies = default deny for anon/authenticated. service_role bypasses RLS for edge function writes/reads.';
COMMENT ON TABLE public.email_send_log IS 'Service-role only. RLS enabled with no policies = default deny for anon/authenticated.';
COMMENT ON TABLE public.email_send_state IS 'Service-role only. RLS enabled with no policies = default deny for anon/authenticated.';
COMMENT ON TABLE public.suppressed_emails IS 'Service-role only. RLS enabled with no policies = default deny for anon/authenticated.';
