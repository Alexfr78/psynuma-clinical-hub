-- Tolerate payments whose debt row no longer exists (e.g. debt removed after invoicing)
CREATE OR REPLACE FUNCTION public.find_debt_id_for_payment(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_debt_id uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF p.invoice_id IS NOT NULL THEN
    SELECT d.id INTO v_debt_id
    FROM public.debts d
    WHERE d.invoice_id = p.invoice_id
      AND d.center_id = p.center_id
      AND d.patient_id = p.patient_id
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_debt_id IS NULL AND p.session_id IS NOT NULL THEN
    SELECT d.id INTO v_debt_id
    FROM public.debts d
    WHERE d.session_id = p.session_id
      AND d.center_id = p.center_id
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_debt_id; -- may be NULL
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_payment_and_recompute_debt_v2(p_payment_id uuid, p_amount numeric, p_payment_date timestamp with time zone, p_payment_method text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT center_id INTO v_payment_center_id FROM payments WHERE id = p_payment_id;
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.find_debt_id_for_payment(p_payment_id);

  UPDATE public.payments
  SET amount = p_amount,
      payment_date = p_payment_date,
      payment_method = p_payment_method,
      reference = p_reference,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_payment_id;

  IF v_debt_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'debt_updated', false);
  END IF;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_payment_and_recompute_debt_v2(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT center_id INTO v_payment_center_id FROM payments WHERE id = p_payment_id;
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.find_debt_id_for_payment(p_payment_id);

  DELETE FROM public.payments WHERE id = p_payment_id;

  IF v_debt_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'debt_updated', false);
  END IF;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.find_debt_id_for_payment(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.find_debt_id_for_payment(uuid) TO authenticated, service_role;