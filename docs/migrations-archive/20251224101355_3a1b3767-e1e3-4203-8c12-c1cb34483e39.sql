-- RPC 1: Recalcular deuda sumando pagos del invoice_id
CREATE OR REPLACE FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d record;
  v_paid numeric := 0;
  v_status text := 'pending';
BEGIN
  SELECT * INTO d
  FROM public.debts
  WHERE id = p_debt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt not found: %', p_debt_id;
  END IF;

  IF d.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Debt % has no invoice_id', p_debt_id;
  END IF;

  SELECT COALESCE(SUM(p.amount), 0)
  INTO v_paid
  FROM public.payments p
  WHERE p.invoice_id = d.invoice_id
    AND p.center_id = d.center_id
    AND p.patient_id = d.patient_id;

  IF v_paid >= d.amount - 0.01 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;

  UPDATE public.debts
  SET paid_amount = v_paid,
      status = v_status,
      updated_at = now()
  WHERE id = p_debt_id;

  RETURN jsonb_build_object('ok', true, 'debt_id', p_debt_id, 'paid_amount', v_paid, 'status', v_status);
END;
$$;

-- RPC 2: Obtener debt_id para un pago por su invoice_id
CREATE OR REPLACE FUNCTION public.get_debt_id_for_payment_by_invoice(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p record;
  v_debt_id uuid;
BEGIN
  SELECT * INTO p
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF p.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Payment % has no invoice_id', p_payment_id;
  END IF;

  SELECT d.id INTO v_debt_id
  FROM public.debts d
  WHERE d.invoice_id = p.invoice_id
    AND d.center_id = p.center_id
    AND d.patient_id = p.patient_id
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_debt_id IS NULL THEN
    RAISE EXCEPTION 'No debt found for payment % (invoice_id=%)', p_payment_id, p.invoice_id;
  END IF;

  RETURN v_debt_id;
END;
$$;

-- RPC 3: Borrar pago y recalcular deuda
CREATE OR REPLACE FUNCTION public.delete_payment_and_recompute_debt_v2(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_debt_id uuid;
BEGIN
  v_debt_id := public.get_debt_id_for_payment_by_invoice(p_payment_id);

  DELETE FROM public.payments WHERE id = p_payment_id;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$$;

-- RPC 4: Actualizar pago y recalcular deuda
CREATE OR REPLACE FUNCTION public.update_payment_and_recompute_debt_v2(
  p_payment_id uuid,
  p_amount numeric,
  p_payment_date timestamptz,
  p_payment_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_debt_id uuid;
BEGIN
  v_debt_id := public.get_debt_id_for_payment_by_invoice(p_payment_id);

  UPDATE public.payments
  SET amount = p_amount,
      payment_date = p_payment_date,
      payment_method = p_payment_method,
      reference = p_reference,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_payment_id;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$$;