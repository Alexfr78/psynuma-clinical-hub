-- Update RPC to also sync invoice.status when debt is fully paid
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

  -- Tolerance for rounding (0.01€)
  IF v_paid >= d.amount - 0.01 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'pending';
  END IF;

  -- Update debt
  UPDATE public.debts
  SET paid_amount = v_paid,
      status = v_status,
      updated_at = now()
  WHERE id = p_debt_id;

  -- Sync invoice.status when debt is fully paid (but only if invoice is issued)
  IF v_status = 'paid' THEN
    UPDATE public.invoices
    SET status = 'paid'
    WHERE id = d.invoice_id
      AND status = 'issued';  -- Only update if issued (not draft, not already paid)
  ELSIF v_status IN ('pending', 'partial') THEN
    -- If debt goes back to pending/partial, revert invoice to issued (if it was paid)
    UPDATE public.invoices
    SET status = 'issued'
    WHERE id = d.invoice_id
      AND status = 'paid';
  END IF;

  RETURN jsonb_build_object('ok', true, 'debt_id', p_debt_id, 'paid_amount', v_paid, 'status', v_status);
END;
$$;