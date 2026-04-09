-- =============================================================================
-- RECTIFICATIVA PAYMENT REASSIGNMENT FIX
-- =============================================================================
-- Business rule: When a total rectificativa is issued for an invoice, the
-- original invoice becomes invalid (is_valid = false). Its debt must NOT
-- remain as a normal pending debt. Payments must be reassignable to the
-- valid rectificativa invoice atomically via backend RPCs.
-- =============================================================================

-- =============================================================================
-- RPC 1: reassign_payment_to_invoice_v2
-- Atomically moves a payment from one invoice to another, recomputes debts
-- and invoice statuses for both source and target.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reassign_payment_to_invoice_v2(
  p_payment_id uuid,
  p_target_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_payment record;
  v_target_invoice record;
  v_previous_invoice_id uuid;
  v_target_debt_id uuid;
  v_previous_debt_id uuid;
  v_paid_sum numeric;
  v_new_status text;
  v_prev_paid_sum numeric;
  v_prev_new_status text;
BEGIN
  -- SECURITY: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado o sin centro asignado';
  END IF;

  -- SECURITY: Verify caller has professional or admin role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes: requiere rol profesional o admin';
  END IF;

  -- 1. Validate payment exists and belongs to caller's center
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_payment_id;
  END IF;

  IF v_payment.center_id != v_user_center_id THEN
    RAISE EXCEPTION 'El pago no pertenece a tu centro';
  END IF;

  v_previous_invoice_id := v_payment.invoice_id;

  -- Block reassignment to the same invoice
  IF v_previous_invoice_id = p_target_invoice_id THEN
    RAISE EXCEPTION 'El pago ya esta vinculado a esta factura';
  END IF;

  -- 2. Validate target invoice exists, belongs to same center, is valid and usable
  SELECT * INTO v_target_invoice
  FROM invoices
  WHERE id = p_target_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura destino no encontrada: %', p_target_invoice_id;
  END IF;

  IF v_target_invoice.center_id != v_user_center_id THEN
    RAISE EXCEPTION 'La factura destino no pertenece a tu centro';
  END IF;

  IF v_target_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura cancelada';
  END IF;

  IF v_target_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura en borrador';
  END IF;

  IF v_target_invoice.is_valid = false THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura invalidada por rectificativa. Usa la factura rectificativa valida.';
  END IF;

  -- 3. Block reassignment to original invoice that has been rectified
  -- (i.e., another invoice exists with rectified_invoice_id pointing to it)
  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE rectified_invoice_id = p_target_invoice_id
      AND is_valid = true
      AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'La factura destino ha sido sustituida por una rectificativa valida. Reasigna el pago a la factura rectificativa.';
  END IF;

  -- 4. Ensure target invoice has a debt record; create one if missing
  SELECT id INTO v_target_debt_id
  FROM debts
  WHERE invoice_id = p_target_invoice_id
  LIMIT 1;

  IF v_target_debt_id IS NULL THEN
    INSERT INTO debts (
      patient_id, center_id, invoice_id, amount, paid_amount, status, notes
    ) VALUES (
      v_target_invoice.patient_id,
      v_target_invoice.center_id,
      p_target_invoice_id,
      v_target_invoice.total,
      0,
      'pending',
      'Deuda creada automaticamente al reasignar pago a factura rectificativa'
    )
    RETURNING id INTO v_target_debt_id;
  END IF;

  -- 5. Move the payment to the target invoice
  UPDATE payments
  SET invoice_id = p_target_invoice_id,
      updated_at = now()
  WHERE id = p_payment_id;

  -- 6. Recompute target invoice debt
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
  FROM payments
  WHERE invoice_id = p_target_invoice_id;

  IF v_paid_sum >= v_target_invoice.total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET paid_amount = v_paid_sum,
      status = v_new_status::payment_status,
      amount = v_target_invoice.total,
      updated_at = now()
  WHERE id = v_target_debt_id;

  -- Update target invoice status
  IF v_new_status = 'paid' THEN
    UPDATE invoices SET status = 'paid', updated_at = now()
    WHERE id = p_target_invoice_id AND status != 'paid';
  ELSE
    UPDATE invoices SET status = 'issued', updated_at = now()
    WHERE id = p_target_invoice_id AND status = 'paid';
  END IF;

  -- 7. Recompute previous invoice debt (if payment was previously linked)
  v_prev_new_status := NULL;
  IF v_previous_invoice_id IS NOT NULL THEN
    SELECT id INTO v_previous_debt_id
    FROM debts
    WHERE invoice_id = v_previous_invoice_id
    LIMIT 1;

    IF v_previous_debt_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_prev_paid_sum
      FROM payments
      WHERE invoice_id = v_previous_invoice_id;

      -- Check if the previous invoice is invalidated by rectificativa
      IF EXISTS (
        SELECT 1 FROM invoices WHERE id = v_previous_invoice_id AND is_valid = false
      ) THEN
        -- Mark debt as 'refunded' (closed/neutralized) since invoice is invalid
        UPDATE debts
        SET paid_amount = v_prev_paid_sum,
            status = 'refunded',
            notes = COALESCE(notes, '') ||
              CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
              'Deuda cerrada: factura invalidada por rectificativa total.',
            updated_at = now()
        WHERE id = v_previous_debt_id;

        v_prev_new_status := 'refunded';
      ELSE
        -- Normal recompute for valid invoices
        DECLARE
          v_prev_invoice_total numeric;
        BEGIN
          SELECT total INTO v_prev_invoice_total
          FROM invoices WHERE id = v_previous_invoice_id;

          IF v_prev_paid_sum >= v_prev_invoice_total THEN
            v_prev_new_status := 'paid';
          ELSIF v_prev_paid_sum > 0 THEN
            v_prev_new_status := 'partial';
          ELSE
            v_prev_new_status := 'pending';
          END IF;

          UPDATE debts
          SET paid_amount = v_prev_paid_sum,
              status = v_prev_new_status::payment_status,
              updated_at = now()
          WHERE id = v_previous_debt_id;

          -- Update previous invoice status
          IF v_prev_new_status = 'paid' THEN
            UPDATE invoices SET status = 'paid', updated_at = now()
            WHERE id = v_previous_invoice_id AND status != 'paid';
          ELSE
            UPDATE invoices SET status = 'issued', updated_at = now()
            WHERE id = v_previous_invoice_id AND status = 'paid';
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  -- 8. Return detailed result
  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'previous_invoice_id', v_previous_invoice_id,
    'target_invoice_id', p_target_invoice_id,
    'target_debt_id', v_target_debt_id,
    'target_paid_amount', v_paid_sum,
    'target_status', v_new_status,
    'previous_debt_id', v_previous_debt_id,
    'previous_debt_status', v_prev_new_status
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.reassign_payment_to_invoice_v2(uuid, uuid) TO authenticated;


-- =============================================================================
-- RPC 2: Improved handle_rectificativa_payments
-- Now attempts auto-reassignment to the valid rectificativa when possible,
-- and marks the original invoice's debt as 'refunded' (closed) instead of
-- leaving it as a normal pending debt.
-- =============================================================================
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
  v_rectificativa_id uuid;
  v_rectificativa_total numeric;
  v_rectificativa_patient_id uuid;
  v_rectificativa_center_id uuid;
  v_rect_debt_id uuid;
  v_auto_reassigned int := 0;
  v_left_unlinked int := 0;
  v_paid_sum numeric;
  v_new_status text;
  v_payment_rec record;
BEGIN
  -- Get total payments linked to the original invoice
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_payments, v_payment_count
  FROM payments
  WHERE invoice_id = p_original_invoice_id;

  -- If no payments, just close the original debt and return
  IF v_payment_count = 0 THEN
    -- Close original debt as refunded (invoice invalidated)
    UPDATE debts
    SET status = 'refunded',
        notes = COALESCE(notes, '') ||
          CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
          'Deuda cerrada: factura invalidada por rectificativa total. Sin pagos previos.',
        updated_at = now()
    WHERE invoice_id = p_original_invoice_id
    RETURNING id INTO v_debt_id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_payments',
      'message', 'No hay pagos que reasignar. Deuda de factura original cerrada.',
      'original_debt_id', v_debt_id,
      'original_debt_status', 'refunded'
    );
  END IF;

  -- Look for a valid rectificativa invoice that replaces the original
  SELECT id, total, patient_id, center_id
  INTO v_rectificativa_id, v_rectificativa_total, v_rectificativa_patient_id, v_rectificativa_center_id
  FROM invoices
  WHERE rectified_invoice_id = p_original_invoice_id
    AND is_valid = true
    AND status != 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  -- Try auto-reassignment if a valid rectificativa exists and totals are compatible
  IF v_rectificativa_id IS NOT NULL THEN
    -- Ensure rectificativa has a debt record
    SELECT id INTO v_rect_debt_id
    FROM debts
    WHERE invoice_id = v_rectificativa_id
    LIMIT 1;

    IF v_rect_debt_id IS NULL THEN
      INSERT INTO debts (
        patient_id, center_id, invoice_id, amount, paid_amount, status, notes
      ) VALUES (
        v_rectificativa_patient_id,
        v_rectificativa_center_id,
        v_rectificativa_id,
        v_rectificativa_total,
        0,
        'pending',
        'Deuda creada automaticamente para factura rectificativa'
      )
      RETURNING id INTO v_rect_debt_id;
    END IF;

    -- Auto-reassign: move all payments from original to rectificativa
    -- This is safe for total rectificativas (the common case)
    FOR v_payment_rec IN
      SELECT id, amount FROM payments WHERE invoice_id = p_original_invoice_id
    LOOP
      UPDATE payments
      SET invoice_id = v_rectificativa_id,
          notes = COALESCE(notes, '') ||
            CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
            'Reasignado automaticamente de factura original a rectificativa.',
          updated_at = now()
      WHERE id = v_payment_rec.id;

      v_auto_reassigned := v_auto_reassigned + 1;
    END LOOP;

    -- Recompute rectificativa debt
    SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
    FROM payments
    WHERE invoice_id = v_rectificativa_id;

    IF v_paid_sum >= v_rectificativa_total THEN
      v_new_status := 'paid';
    ELSIF v_paid_sum > 0 THEN
      v_new_status := 'partial';
    ELSE
      v_new_status := 'pending';
    END IF;

    UPDATE debts
    SET paid_amount = v_paid_sum,
        status = v_new_status::payment_status,
        amount = v_rectificativa_total,
        updated_at = now()
    WHERE id = v_rect_debt_id;

    -- Update rectificativa invoice status
    IF v_new_status = 'paid' THEN
      UPDATE invoices SET status = 'paid', updated_at = now()
      WHERE id = v_rectificativa_id AND status != 'paid';
    END IF;

  ELSE
    -- No valid rectificativa found yet (edge case: called before rectificativa is inserted)
    -- Unlink payments but mark them clearly for manual reassignment
    UPDATE payments
    SET invoice_id = NULL,
        notes = COALESCE(notes, '') ||
          CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
          'Desvinculado por rectificativa. Pendiente de reasignacion manual a factura valida.',
        updated_at = now()
    WHERE invoice_id = p_original_invoice_id;

    v_left_unlinked := v_payment_count;
  END IF;

  -- Close the original invoice's debt as 'refunded' regardless of what happened above.
  -- A rectified invoice should never appear as pending operational debt.
  UPDATE debts
  SET paid_amount = 0,
      status = 'refunded',
      notes = COALESCE(notes, '') ||
        CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
        CASE
          WHEN v_auto_reassigned > 0 THEN
            format('Deuda cerrada: %s pago(s) reasignado(s) a rectificativa %s.', v_auto_reassigned, v_rectificativa_id)
          ELSE
            format('Deuda cerrada: factura invalidada por rectificativa. %s pago(s) pendiente(s) de reasignacion manual.', v_left_unlinked)
        END,
      updated_at = now()
  WHERE invoice_id = p_original_invoice_id
  RETURNING id INTO v_debt_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', CASE
      WHEN v_auto_reassigned > 0 THEN 'payments_auto_reassigned'
      ELSE 'payments_unlinked'
    END,
    'message', CASE
      WHEN v_auto_reassigned > 0 THEN
        format('Se han reasignado automaticamente %s pago(s) por %s EUR a la factura rectificativa.', v_auto_reassigned, v_total_payments)
      ELSE
        format('Se han desvinculado %s pago(s) por %s EUR. Pendientes de reasignacion manual.', v_left_unlinked, v_total_payments)
    END,
    'auto_reassigned', v_auto_reassigned,
    'left_unlinked', v_left_unlinked,
    'total_amount', v_total_payments,
    'original_debt_id', v_debt_id,
    'original_debt_status', 'refunded',
    'rectificativa_id', v_rectificativa_id,
    'rectificativa_debt_id', v_rect_debt_id,
    'rectificativa_debt_status', v_new_status
  );
END;
$$;
