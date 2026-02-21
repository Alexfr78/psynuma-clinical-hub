-- Create a secure function that returns center data with sensitive fields masked for non-admins
CREATE OR REPLACE FUNCTION public.get_safe_center(p_center_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Must belong to this center
  IF p_center_id != public.get_user_center_id(auth.uid()) THEN
    RETURN NULL;
  END IF;
  
  -- Get full center data
  SELECT to_jsonb(c) INTO v_result FROM public.centers c WHERE c.id = p_center_id;
  
  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Mask encrypted credential fields for non-admin users
  IF NOT public.is_admin(auth.uid()) THEN
    v_result := v_result 
      - 'verifactu_certificate_base64'
      - 'verifactu_certificate_password'
      - 'whatsapp_access_token'
      - 'oauth_google_credentials'
      - 'oauth_zoom_credentials'
      - 'oauth_stripe_credentials';
  END IF;
  
  RETURN v_result;
END;
$$;