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
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado o sin centro asignado';
  END IF;

  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes: requiere rol profesional o admin';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_payment_id;
  END IF;
  IF v_payment.center_id != v_user_center_id THEN
    RAISE EXCEPTION 'El pago no pertenece a tu centro';
  END IF;

  v_previous_invoice_id := v_payment.invoice_id;
  IF v_previous_invoice_id = p_target_invoice_id THEN
    RAISE EXCEPTION 'El pago ya esta vinculado a esta factura';
  END IF;

  SELECT * INTO v_target_invoice FROM invoices WHERE id = p_target_invoice_id;
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

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE rectified_invoice_id = p_target_invoice_id
      AND is_valid = true
      AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'La factura destino ha sido sustituida por una rectificativa valida. Reasigna el pago a la factura rectificativa.';
  END IF;

  SELECT id INTO v_target_debt_id FROM debts WHERE invoice_id = p_target_invoice_id LIMIT 1;

  IF v_target_debt_id IS NULL THEN
    INSERT INTO debts (patient_id, center_id, invoice_id, amount, paid_amount, status, notes)
    VALUES (
      v_target_invoice.patient_id,
      v_target_invoice.center_id,
      p_target_invoice_id,
      v_target_invoice.total,
      0,
      'pending',
      'Deuda creada automaticamente al reasignar pago a factura'
    )
    RETURNING id INTO v_target_debt_id;
  END IF;

  UPDATE payments
  SET invoice_id = p_target_invoice_id, updated_at = now()
  WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum FROM payments WHERE invoice_id = p_target_invoice_id;

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

  IF v_new_status = 'paid' THEN
    UPDATE invoices SET status = 'paid', updated_at = now()
    WHERE id = p_target_invoice_id AND status != 'paid';
  ELSE
    UPDATE invoices SET status = 'issued', updated_at = now()
    WHERE id = p_target_invoice_id AND status = 'paid';
  END IF;

  v_prev_new_status := NULL;
  IF v_previous_invoice_id IS NOT NULL THEN
    SELECT id INTO v_previous_debt_id FROM debts WHERE invoice_id = v_previous_invoice_id LIMIT 1;

    IF v_previous_debt_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_prev_paid_sum FROM payments WHERE invoice_id = v_previous_invoice_id;

      IF EXISTS (SELECT 1 FROM invoices WHERE id = v_previous_invoice_id AND is_valid = false) THEN
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
        DECLARE
          v_prev_invoice_total numeric;
        BEGIN
          SELECT total INTO v_prev_invoice_total FROM invoices WHERE id = v_previous_invoice_id;

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

GRANT EXECUTE ON FUNCTION public.reassign_payment_to_invoice_v2(uuid, uuid) TO authenticated;