CREATE OR REPLACE FUNCTION public.create_session_type_with_order(p_center_id uuid, p_name text, p_default_price numeric, p_duration_minutes integer, p_color text, p_commission_rate numeric DEFAULT NULL::numeric, p_tax_treatment text DEFAULT NULL::text, p_vat_rate numeric DEFAULT NULL::numeric, p_exemption_code text DEFAULT NULL::text, p_non_subject_code text DEFAULT NULL::text, p_vat_regime_key text DEFAULT NULL::text, p_is_public boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_new_order integer;
  v_new_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());

  IF v_user_center_id IS NULL OR v_user_center_id != p_center_id THEN
    RAISE EXCEPTION 'No tienes permiso para este centro';
  END IF;

  IF NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para crear tipos de sesión';
  END IF;

  -- Serializa la asignación de orden por centro sin usar FOR UPDATE con agregados
  PERFORM pg_advisory_xact_lock(hashtextextended(p_center_id::text, 0));

  SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_new_order
    FROM session_types
   WHERE center_id = p_center_id;

  INSERT INTO session_types (
    center_id, name, default_price, duration_minutes, color,
    commission_rate, tax_treatment, vat_rate, exemption_code,
    non_subject_code, vat_regime_key, is_public, display_order, is_active
  ) VALUES (
    p_center_id, p_name, p_default_price, p_duration_minutes, p_color,
    p_commission_rate,
    COALESCE(p_tax_treatment, 'exempt'),
    p_vat_rate,
    p_exemption_code,
    p_non_subject_code,
    p_vat_regime_key,
    COALESCE(p_is_public, true),
    v_new_order,
    true
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;