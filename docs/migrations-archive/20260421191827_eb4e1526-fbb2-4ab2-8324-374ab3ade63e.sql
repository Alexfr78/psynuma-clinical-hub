
CREATE OR REPLACE FUNCTION public.collect_session_payment_v2(
  p_session_id uuid,
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
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
  v_invoice_status invoice_status;
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

  -- Try to find an active debt
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

  -- If no debt exists, create one based on the session price
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
    RAISE EXCEPTION 'El importe (%.2f) excede el saldo pendiente (%.2f)', p_amount, v_remaining;
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

  -- Sync session payment_status
  UPDATE public.sessions
  SET payment_status = v_new_status::text, updated_at = now()
  WHERE id = p_session_id;

  -- Sync invoice if linked
  IF v_debt.invoice_id IS NOT NULL THEN
    SELECT total INTO v_invoice_total FROM public.invoices WHERE id = v_debt.invoice_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_invoice_paid
    FROM public.payments WHERE invoice_id = v_debt.invoice_id;

    IF v_invoice_paid >= v_invoice_total - 0.01 THEN
      v_invoice_status := 'paid'::invoice_status;
    ELSIF v_invoice_paid > 0 THEN
      v_invoice_status := 'partial'::invoice_status;
    ELSE
      v_invoice_status := 'pending'::invoice_status;
    END IF;

    UPDATE public.invoices
    SET status = v_invoice_status, updated_at = now()
    WHERE id = v_debt.invoice_id;
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
