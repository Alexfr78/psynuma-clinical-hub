-- get_safe_center already masks oauth_google_credentials/oauth_zoom_credentials/
-- oauth_stripe_credentials (encrypted secrets) for non-admins. It predates
-- oauth_google_drive_credentials (added in 20260828100000), so that column
-- was still readable by non-admin professionals through the RPC despite the
-- column-level REVOKE on the raw table (SECURITY DEFINER bypasses grants).
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
      - 'oauth_google_drive_credentials'
      - 'openai_api_key_encrypted'
      - 'gemini_api_key_encrypted';
  END IF;

  RETURN v_result;
END;
$function$;
