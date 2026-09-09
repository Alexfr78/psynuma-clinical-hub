CREATE OR REPLACE FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_debt_center_id uuid;
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_paid_sum numeric;
  v_new_status text;
  v_invoice_status text;
  v_session_id uuid;
  v_result jsonb;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  SELECT center_id, invoice_id, session_id INTO v_debt_center_id, v_invoice_id, v_session_id
  FROM debts
  WHERE id = p_debt_id;
  
  IF v_debt_center_id IS NULL OR v_debt_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Debt not found or does not belong to your center';
  END IF;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Debt % has no invoice_id', p_debt_id;
  END IF;

  SELECT total, status INTO v_invoice_total, v_invoice_status
  FROM invoices
  WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
  FROM payments
  WHERE invoice_id = v_invoice_id;

  IF v_paid_sum >= v_invoice_total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET 
    paid_amount = v_paid_sum,
    status = v_new_status::payment_status,
    updated_at = now()
  WHERE id = p_debt_id;

  -- Sync invoice status
  IF v_new_status = 'paid' AND v_invoice_status IN ('issued', 'partial') THEN
    UPDATE invoices SET status = 'paid', updated_at = now() WHERE id = v_invoice_id;
  ELSIF v_new_status != 'paid' AND v_invoice_status = 'paid' THEN
    UPDATE invoices SET status = 'issued', updated_at = now() WHERE id = v_invoice_id;
  END IF;

  -- Auto-complete past session when debt is fully paid
  IF v_new_status = 'paid' AND v_session_id IS NOT NULL THEN
    UPDATE sessions
    SET status = 'completed', updated_at = now()
    WHERE id = v_session_id
      AND status IN ('scheduled', 'confirmed')
      AND session_date < CURRENT_DATE;
  END IF;

  v_result := jsonb_build_object(
    'debt_id', p_debt_id,
    'invoice_id', v_invoice_id,
    'invoice_total', v_invoice_total,
    'paid_amount', v_paid_sum,
    'status', v_new_status
  );

  RETURN v_result;
END;
$$;