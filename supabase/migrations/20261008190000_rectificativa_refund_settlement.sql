-- Rectificativas por diferencias y devoluciones (producción, 2026-10-08).
--
-- Antes, al crear CUALQUIER rectificativa, handle_rectificativa_payments
-- desvinculaba los cobros de la factura original ("Pendiente de reasignar") y
-- reabría su deuda a pendiente con 0 pagado. En una rectificativa por
-- diferencias (abono) con devolución eso está mal: el paciente sí pagó la
-- original, y la devolución es lo que liquida la rectificativa.
--
-- Ahora:
-- 1. Rectificativa por diferencias con devolución (p_refund_expected, por
--    defecto): los cobros siguen en la original. Si ya están devueltos por el
--    importe del abono, la rectificativa pasa a 'paid' y la deuda de la
--    original se cierra con el saldo neto.
-- 2. Por diferencias SIN devolución (p. ej. abono total para rehacer la factura)
--    y sustitutiva: como antes, los cobros se desvinculan para reasignarlos.
-- 3. settle_rectificativas_by_refunds_internal: la usa también stripe-webhook
--    (charge.refunded) para cuando la devolución llega DESPUÉS del abono.
--    Solo cuenta devoluciones registradas en payments.refunded_amount (Stripe);
--    una devolución en efectivo o transferencia se liquida a mano.

CREATE OR REPLACE FUNCTION public.settle_rectificativas_by_refunds_internal(p_original_invoice_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_refunded numeric;
  v_already_settled numeric;
  v_available numeric;
  v_rect record;
  v_settled int := 0;
  v_net_invoice numeric;
  v_net_paid numeric;
BEGIN
  IF p_original_invoice_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(SUM(refunded_amount), 0)
  INTO v_refunded
  FROM payments
  WHERE invoice_id = p_original_invoice_id;

  IF v_refunded <= 0 THEN
    RETURN 0;
  END IF;

  -- Lo que ya consumieron abonos liquidados antes no se vuelve a usar.
  SELECT COALESCE(SUM(-total), 0)
  INTO v_already_settled
  FROM invoices
  WHERE rectified_invoice_id = p_original_invoice_id
    AND rectification_type = 'differences'
    AND status = 'paid'
    AND total < 0;

  v_available := v_refunded - v_already_settled;

  FOR v_rect IN
    SELECT id, total
    FROM invoices
    WHERE rectified_invoice_id = p_original_invoice_id
      AND rectification_type = 'differences'
      AND status = 'issued'
      AND is_valid = true
      AND total < 0
    ORDER BY issue_date, created_at
  LOOP
    EXIT WHEN -v_rect.total > v_available + 0.005;

    UPDATE invoices SET status = 'paid' WHERE id = v_rect.id;
    v_available := v_available + v_rect.total;
    v_settled := v_settled + 1;
  END LOOP;

  -- Deuda de la original: si lo cobrado neto (cobros - devoluciones) cubre lo
  -- facturado neto (original + abonos pagados), se cierra con ese saldo para
  -- que no vuelva a pedirse el dinero devuelto (amount - paid_amount = 0).
  IF v_already_settled > 0 OR v_settled > 0 THEN
    SELECT i.total + COALESCE((
      SELECT SUM(r.total)
      FROM invoices r
      WHERE r.rectified_invoice_id = i.id
        AND r.rectification_type = 'differences'
        AND r.status = 'paid'
        AND r.total < 0
    ), 0)
    INTO v_net_invoice
    FROM invoices i
    WHERE i.id = p_original_invoice_id;

    SELECT COALESCE(SUM(amount - COALESCE(refunded_amount, 0)), 0)
    INTO v_net_paid
    FROM payments
    WHERE invoice_id = p_original_invoice_id;

    IF v_net_paid >= v_net_invoice - 0.005 THEN
      UPDATE debts
      SET
        amount = GREATEST(v_net_invoice, 0),
        paid_amount = GREATEST(v_net_invoice, 0),
        status = (CASE WHEN v_net_invoice <= 0.005 THEN 'refunded' ELSE 'paid' END)::payment_status,
        notes = COALESCE(notes, '') ||
          CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
          format('Ajustada por rectificativa: neto facturado %s€.', round(GREATEST(v_net_invoice, 0), 2)),
        updated_at = now()
      WHERE invoice_id = p_original_invoice_id
        AND status IN ('pending', 'partial');
    END IF;
  END IF;

  RETURN v_settled;
END;
$function$;

REVOKE ALL ON FUNCTION public.settle_rectificativas_by_refunds_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_rectificativas_by_refunds_internal(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.handle_rectificativa_payments(uuid);
DROP FUNCTION IF EXISTS public.handle_rectificativa_payments(uuid, uuid);

CREATE OR REPLACE FUNCTION public.handle_rectificativa_payments(
  p_original_invoice_id uuid,
  p_rectificativa_id uuid DEFAULT NULL,
  p_refund_expected boolean DEFAULT true
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_payments numeric;
  v_payment_count int;
  v_debt_id uuid;
  v_rect_type text;
  v_rect_total numeric;
  v_settled int;
BEGIN
  PERFORM public.assert_center_access((SELECT center_id FROM public.invoices WHERE id = p_original_invoice_id));

  -- Rectificativa recién creada (sin id: la más reciente de la original).
  SELECT rectification_type, total
  INTO v_rect_type, v_rect_total
  FROM invoices
  WHERE rectified_invoice_id = p_original_invoice_id
    AND (p_rectificativa_id IS NULL OR id = p_rectificativa_id)
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_rect_type IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'action', 'no_rectificativa',
      'message', 'No se encontró la rectificativa de esta factura; no se han tocado los cobros.'
    );
  END IF;

  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_payments, v_payment_count
  FROM payments
  WHERE invoice_id = p_original_invoice_id;

  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_payments',
      'message', 'No hay pagos que reasignar'
    );
  END IF;

  IF v_rect_type = 'differences' AND (p_refund_expected OR v_rect_total >= 0) THEN
    -- Los cobros se quedan en la original; la devolución liquida el abono.
    v_settled := public.settle_rectificativas_by_refunds_internal(p_original_invoice_id);

    IF v_settled > 0 THEN
      RETURN jsonb_build_object(
        'success', true,
        'action', 'rectificativa_settled_by_refund',
        'message', 'La devolución ya registrada liquida esta rectificativa: queda como pagada.'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'payments_kept',
      'message', CASE WHEN v_rect_total < 0
        THEN 'Los cobros siguen en la factura original. Si devuelves el dinero por Stripe, la rectificativa quedará pagada sola; si lo devuelves de otra forma, márcala como pagada a mano.'
        ELSE 'Los cobros siguen en la factura original.'
      END
    );
  END IF;

  -- Sustitutiva, o abono sin devolución: se desvinculan para reasignarlos.
  UPDATE payments
  SET
    invoice_id = NULL,
    notes = COALESCE(notes, '') ||
      CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
      'Desvinculado por rectificativa de factura. Pendiente de reasignar.',
    updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

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
$function$;

REVOKE ALL ON FUNCTION public.handle_rectificativa_payments(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_rectificativa_payments(uuid, uuid, boolean) TO authenticated, service_role;
