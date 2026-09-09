-- =============================================================================
-- COLLECT SESSION PAYMENT V2
-- =============================================================================
-- Prevents double-charging a session by resolving the real outstanding balance
-- from the current valid invoice/debt before accepting payment. Operates
-- atomically so concurrent clicks cannot both succeed.
--
-- Root cause of the old bug: the frontend hook (useCollectSessionPayment) used
-- maybeSingle() on debts by session_id without filtering out refunded debts or
-- debts linked to invalidated invoices. It then blindly added the payment
-- amount to paid_amount without checking if the session was already fully paid.
-- There was no server-side guard against overpayment.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.collect_session_payment_v2(
  p_session_id uuid,
  p_patient_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date DEFAULT CURRENT_DATE,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_session_center_id uuid;
  v_valid_invoice_id uuid;
  v_valid_invoice_total numeric;
  v_debt record;
  v_debt_id uuid;
  v_debt_amount numeric;
  v_current_paid numeric;
  v_remaining numeric;
  v_new_paid numeric;
  v_new_status text;
  v_payment_id uuid;
BEGIN
  -- SECURITY: Verify caller
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado o sin centro asignado';
  END IF;

  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes';
  END IF;

  -- Verify session belongs to caller's center
  SELECT center_id INTO v_session_center_id
  FROM sessions WHERE id = p_session_id;

  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesion no encontrada o no pertenece a tu centro';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  -- =========================================================================
  -- 1. Resolve the current valid invoice for this session
  -- =========================================================================
  -- Look through invoice_items (by session_id or billable_event_id) to find
  -- invoices, then pick the valid non-cancelled one. If a rectificativa exists,
  -- that is the valid invoice.
  SELECT i.id, i.total
  INTO v_valid_invoice_id, v_valid_invoice_total
  FROM invoice_items ii
  JOIN invoices i ON i.id = ii.invoice_id
  WHERE (ii.session_id = p_session_id
         OR ii.billable_event_id IN (
           SELECT be.id FROM billable_events be WHERE be.session_id = p_session_id
         ))
    AND i.is_valid = true
    AND i.status != 'cancelled'
  ORDER BY i.created_at DESC
  LIMIT 1;

  -- =========================================================================
  -- 2. Resolve the active debt for this session
  -- =========================================================================
  -- Exclude refunded debts and debts linked to invalidated invoices.
  -- Prefer a debt linked to the valid invoice; fall back to any active debt
  -- for this session.
  SELECT d.* INTO v_debt
  FROM debts d
  LEFT JOIN invoices inv ON inv.id = d.invoice_id
  WHERE d.session_id = p_session_id
    AND d.status NOT IN ('refunded')
    AND (d.invoice_id IS NULL OR inv.is_valid = true)
  ORDER BY
    CASE WHEN d.invoice_id = v_valid_invoice_id THEN 0 ELSE 1 END,
    d.created_at DESC
  LIMIT 1
  FOR UPDATE;  -- Lock the row to prevent concurrent double-charge

  IF v_debt.id IS NOT NULL THEN
    v_debt_id := v_debt.id;
    v_debt_amount := v_debt.amount;
    v_current_paid := COALESCE(v_debt.paid_amount, 0);

    -- If the debt doesn't point to the valid invoice, fix it
    IF v_valid_invoice_id IS NOT NULL AND v_debt.invoice_id IS DISTINCT FROM v_valid_invoice_id THEN
      UPDATE debts SET invoice_id = v_valid_invoice_id, updated_at = now()
      WHERE id = v_debt_id;
    END IF;
  ELSE
    -- No active debt exists; create one
    v_debt_amount := COALESCE(v_valid_invoice_total, p_amount);
    v_current_paid := 0;

    INSERT INTO debts (
      session_id, patient_id, center_id, invoice_id, amount, paid_amount, status
    ) VALUES (
      p_session_id, p_patient_id, v_user_center_id,
      v_valid_invoice_id, v_debt_amount, 0, 'pending'
    )
    RETURNING id INTO v_debt_id;
  END IF;

  -- =========================================================================
  -- 3. Check remaining balance — block overpayment / double-charge
  -- =========================================================================
  -- Recompute from actual payments in DB (not from debt.paid_amount which may
  -- be stale). This is the authoritative guard.
  SELECT COALESCE(SUM(amount), 0) INTO v_current_paid
  FROM payments
  WHERE (invoice_id = v_valid_invoice_id OR session_id = p_session_id)
    AND invoice_id IS NOT DISTINCT FROM
        CASE WHEN v_valid_invoice_id IS NOT NULL THEN v_valid_invoice_id
             ELSE invoice_id END;

  -- More precise: if there's a valid invoice, sum payments by that invoice.
  -- Otherwise, sum payments by session_id.
  IF v_valid_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_current_paid
    FROM payments WHERE invoice_id = v_valid_invoice_id;
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO v_current_paid
    FROM payments WHERE session_id = p_session_id AND invoice_id IS NULL;
  END IF;

  v_remaining := GREATEST(v_debt_amount - v_current_paid, 0);

  IF v_remaining < 0.01 THEN
    RAISE EXCEPTION 'La sesion ya esta completamente cobrada y no admite nuevos pagos. Pendiente: 0.00€';
  END IF;

  IF p_amount > v_remaining + 0.01 THEN
    RAISE EXCEPTION 'El importe (%.2f€) supera el pendiente real (%.2f€). Ajusta el importe.', p_amount, v_remaining;
  END IF;

  -- =========================================================================
  -- 4. Insert payment
  -- =========================================================================
  INSERT INTO payments (
    session_id, patient_id, center_id, invoice_id,
    amount, payment_method, payment_date, reference, notes
  ) VALUES (
    p_session_id, p_patient_id, v_user_center_id, v_valid_invoice_id,
    p_amount, p_payment_method, p_payment_date, p_reference, p_notes
  )
  RETURNING id INTO v_payment_id;

  -- =========================================================================
  -- 5. Recompute debt from actual payments
  -- =========================================================================
  v_new_paid := v_current_paid + p_amount;

  IF v_new_paid >= v_debt_amount - 0.01 THEN
    v_new_status := 'paid';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET paid_amount = v_new_paid,
      status = v_new_status::payment_status,
      updated_at = now()
  WHERE id = v_debt_id;

  -- =========================================================================
  -- 6. Sync invoice status if applicable
  -- =========================================================================
  IF v_valid_invoice_id IS NOT NULL THEN
    IF v_new_status = 'paid' THEN
      UPDATE invoices SET status = 'paid', updated_at = now()
      WHERE id = v_valid_invoice_id AND status != 'paid';
    ELSE
      UPDATE invoices SET status = 'issued', updated_at = now()
      WHERE id = v_valid_invoice_id AND status = 'paid';
    END IF;
  END IF;

  -- =========================================================================
  -- 7. Return result
  -- =========================================================================
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'debt_id', v_debt_id,
    'invoice_id', v_valid_invoice_id,
    'amount_paid', p_amount,
    'total_paid', v_new_paid,
    'debt_amount', v_debt_amount,
    'remaining', GREATEST(v_debt_amount - v_new_paid, 0),
    'status', v_new_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.collect_session_payment_v2(uuid, uuid, numeric, text, date, text, text) TO authenticated;
