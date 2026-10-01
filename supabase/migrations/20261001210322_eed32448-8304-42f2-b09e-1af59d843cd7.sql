CREATE OR REPLACE FUNCTION public.collect_session_payment_v2(p_session_id uuid, p_patient_id uuid, p_amount numeric, p_payment_method text, p_payment_date date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
  v_session_price numeric(10,2);
  v_session_bono uuid;
  v_debt RECORD;
  v_remaining numeric(10,2);
  v_new_paid numeric(10,2);
  v_new_status payment_status;
  v_payment_id uuid;
  v_invoice_total numeric(10,2);
  v_invoice_paid numeric(10,2);
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  SELECT center_id, price, bono_id INTO v_center_id, v_session_price, v_session_bono
  FROM public.sessions WHERE id = p_session_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_center_id <> public.get_user_center_id(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para esta sesión';
  END IF;

  IF v_session_bono IS NOT NULL THEN
    RAISE EXCEPTION 'Esta sesión está cubierta por un bono';
  END IF;

  SELECT d.*
  INTO v_debt
  FROM public.debts d
  LEFT JOIN public.invoices i ON i.id = d.invoice_id
  WHERE d.session_id = p_session_id
    AND d.patient_id = p_patient_id
    AND d.status <> 'refunded'
    AND (i.id IS NULL OR i.is_valid = true)
  ORDER BY
    CASE WHEN d.invoice_id IS NOT NULL THEN 0 ELSE 1 END,
    d.created_at DESC
  LIMIT 1
  FOR UPDATE OF d;

  IF v_debt.id IS NULL THEN
    IF COALESCE(v_session_price, 0) <= 0 THEN
      RAISE EXCEPTION 'La sesión no tiene importe a cobrar';
    END IF;

    INSERT INTO public.debts (
      center_id, patient_id, session_id, amount, paid_amount, status, due_date
    ) VALUES (
      v_center_id, p_patient_id, p_session_id, v_session_price, 0,
      'pending'::payment_status, CURRENT_DATE
    )
    RETURNING * INTO v_debt;
  END IF;

  v_remaining := GREATEST(v_debt.amount - COALESCE(v_debt.paid_amount, 0), 0);

  IF v_remaining < 0.01 THEN
    RAISE EXCEPTION 'La sesión ya está cobrada';
  END IF;

  IF p_amount - v_remaining > 0.01 THEN
    RAISE EXCEPTION 'El importe (% €) excede el saldo pendiente (% €)', p_amount, v_remaining;
  END IF;

  INSERT INTO public.payments (
    center_id, patient_id, session_id, invoice_id,
    amount, payment_method, payment_date, reference, notes
  ) VALUES (
    v_center_id, p_patient_id, p_session_id, v_debt.invoice_id,
    p_amount, p_payment_method, p_payment_date, p_reference, p_notes
  )
  RETURNING id INTO v_payment_id;

  v_new_paid := COALESCE(v_debt.paid_amount, 0) + p_amount;
  IF v_new_paid >= v_debt.amount - 0.01 THEN
    v_new_status := 'paid'::payment_status;
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial'::payment_status;
  ELSE
    v_new_status := 'pending'::payment_status;
  END IF;

  UPDATE public.debts
  SET paid_amount = v_new_paid, status = v_new_status, updated_at = now()
  WHERE id = v_debt.id;

  UPDATE public.sessions
  SET payment_status = v_new_status::text, updated_at = now()
  WHERE id = p_session_id;

  IF v_debt.invoice_id IS NOT NULL THEN
    SELECT total INTO v_invoice_total FROM public.invoices WHERE id = v_debt.invoice_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_invoice_paid
    FROM public.payments WHERE invoice_id = v_debt.invoice_id;

    IF v_invoice_paid >= v_invoice_total - 0.01 THEN
      UPDATE public.invoices
      SET status = 'paid'::invoice_status, updated_at = now()
      WHERE id = v_debt.invoice_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'debt_id', v_debt.id,
    'invoice_id', v_debt.invoice_id,
    'amount_paid', p_amount,
    'total_paid', v_new_paid,
    'debt_amount', v_debt.amount,
    'remaining', GREATEST(v_debt.amount - v_new_paid, 0),
    'status', v_new_status::text
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.collect_session_payment_split(
  p_session_id uuid,
  p_patient_id uuid,
  p_parts jsonb,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_part jsonb;
  v_amount numeric(10,2);
  v_method text;
  v_result jsonb;
  v_payment_ids uuid[] := '{}';
BEGIN
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) < 2 THEN
    RAISE EXCEPTION 'Un cobro dividido necesita al menos dos partes';
  END IF;

  FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts) LOOP
    v_method := nullif(trim(v_part->>'method'), '');
    v_amount := (v_part->>'amount')::numeric;

    IF v_method IS NULL THEN
      RAISE EXCEPTION 'Cada parte del cobro necesita un método de pago';
    END IF;

    v_result := public.collect_session_payment_v2(
      p_session_id, p_patient_id, v_amount, v_method,
      p_payment_date, p_reference, p_notes
    );
    v_payment_ids := v_payment_ids || (v_result->>'payment_id')::uuid;
  END LOOP;

  RETURN v_result || jsonb_build_object(
    'payment_ids', to_jsonb(v_payment_ids),
    'amount_paid', (SELECT sum((p->>'amount')::numeric) FROM jsonb_array_elements(p_parts) p)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.collect_session_payment_split(uuid, uuid, jsonb, date, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.collect_session_payment_split(uuid, uuid, jsonb, date, text, text) TO authenticated, service_role;