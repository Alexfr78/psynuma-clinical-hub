-- Fix the recompute_debt_by_invoice function to properly cast status to payment_status enum
CREATE OR REPLACE FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_paid_sum numeric;
  v_new_status text;
  v_result jsonb;
BEGIN
  -- Get the invoice_id from the debt
  SELECT invoice_id INTO v_invoice_id
  FROM debts
  WHERE id = p_debt_id;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Debt % has no invoice_id', p_debt_id;
  END IF;

  -- Get invoice total
  SELECT total INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;

  -- Sum all payments for this invoice
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
  FROM payments
  WHERE invoice_id = v_invoice_id;

  -- Determine new status
  IF v_paid_sum >= v_invoice_total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  -- Update debt with proper enum casting
  UPDATE debts
  SET 
    paid_amount = v_paid_sum,
    status = v_new_status::payment_status,
    updated_at = now()
  WHERE id = p_debt_id;

  -- Build result
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

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION public.recompute_debt_by_invoice(uuid) TO authenticated;