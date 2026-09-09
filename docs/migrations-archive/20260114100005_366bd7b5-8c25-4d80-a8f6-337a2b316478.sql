-- Function to handle payments when a rectificativa total is created
-- This unlinks payments from the original invoice and marks them as pending reassignment
CREATE OR REPLACE FUNCTION public.handle_rectificativa_payments(p_original_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total_payments numeric;
  v_payment_count int;
  v_debt_id uuid;
BEGIN
  -- Get total payments linked to the original invoice
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_payments, v_payment_count
  FROM payments
  WHERE invoice_id = p_original_invoice_id;

  -- If no payments, nothing to do
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_payments',
      'message', 'No hay pagos que reasignar'
    );
  END IF;

  -- Unlink payments from the original invoice (set invoice_id = NULL)
  -- This marks them as "pending reassignment"
  UPDATE payments
  SET 
    invoice_id = NULL,
    notes = COALESCE(notes, '') || 
      CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
      'Desvinculado por rectificativa de factura. Pendiente de reasignar.',
    updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  -- Update the debt associated with the original invoice
  -- Set paid_amount to 0 and status to pending
  UPDATE debts
  SET 
    paid_amount = 0,
    status = 'pending',
    updated_at = now()
  WHERE invoice_id = p_original_invoice_id
  RETURNING id INTO v_debt_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'payments_unlinked',
    'message', format('Se han desvinculado %s pago(s) por un total de %s€. Pendientes de reasignar.', v_payment_count, v_total_payments),
    'unlinked_payments', v_payment_count,
    'unlinked_amount', v_total_payments,
    'debt_id', v_debt_id
  );
END;
$$;