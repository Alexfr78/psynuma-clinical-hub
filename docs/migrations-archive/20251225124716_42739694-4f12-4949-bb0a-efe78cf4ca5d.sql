-- Bootstrap function to create first center + assign roles atomically (avoids RLS circular deps)
CREATE OR REPLACE FUNCTION public.bootstrap_create_center(
  p_name text,
  p_tax_id text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_postal_code text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_can_create_center(v_user_id) THEN
    RAISE EXCEPTION 'User already has a center';
  END IF;

  INSERT INTO public.centers (
    name, tax_id, address, city, postal_code, phone, email
  ) VALUES (
    p_name,
    NULLIF(p_tax_id, ''),
    NULLIF(p_address, ''),
    NULLIF(p_city, ''),
    NULLIF(p_postal_code, ''),
    NULLIF(p_phone, ''),
    NULLIF(p_email, '')
  )
  RETURNING id INTO v_center_id;

  UPDATE public.profiles
  SET center_id = v_center_id,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.user_roles (user_id, center_id, role)
  VALUES
    (v_user_id, v_center_id, 'admin'::public.app_role),
    (v_user_id, v_center_id, 'professional'::public.app_role)
  ON CONFLICT (user_id, center_id, role) DO NOTHING;

  RETURN v_center_id;
END;
$$;

-- Allow authenticated users to call it (still enforced inside the function)
REVOKE ALL ON FUNCTION public.bootstrap_create_center(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_create_center(text, text, text, text, text, text, text) TO authenticated;

-- Fix linter: ensure search_path is set for this function
ALTER FUNCTION public.update_calendar_events_updated_at() SET search_path = public;