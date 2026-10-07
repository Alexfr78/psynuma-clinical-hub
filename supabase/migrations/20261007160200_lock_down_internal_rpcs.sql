-- Barrido de funciones SECURITY DEFINER ejecutables por anon/authenticated
-- que no comprueban al llamante (producción, 2026-10-07).
--
-- 1. handle_rectificativa_payments: desvinculaba los pagos de cualquier
--    factura y ponía su deuda a 0, incluso como anon. La usa
--    CreateRectificativaDialog con el usuario: ahora exige ser profesional o
--    admin del centro de la factura (assert_center_access).
-- 2. Internas: solo las llaman edge functions con service role o funciones
--    SECURITY DEFINER (que se ejecutan como propietario), nunca la app ni una
--    policy. Quedan solo para service_role.

CREATE OR REPLACE FUNCTION public.handle_rectificativa_payments(p_original_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_payments numeric;
  v_payment_count int;
  v_debt_id uuid;
BEGIN
  PERFORM public.assert_center_access((SELECT center_id FROM public.invoices WHERE id = p_original_invoice_id));

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
$function$;

REVOKE ALL ON FUNCTION public.handle_rectificativa_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.handle_rectificativa_payments(uuid) TO authenticated, service_role;

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_center_for_session_token',          -- sin uso; no valida ningún token pese al nombre
        'get_public_center_info',                -- sin uso
        'move_invoice_financials_for_replacement', -- create_rectificativa_substitution / create_f3_replacement
        'find_debt_id_for_payment',              -- *_payment_and_recompute_debt_v2
        'get_debt_id_for_payment_by_invoice',    -- sin uso
        'acquire_verifactu_chain_lock',          -- sign-invoice-verifactu (service role)
        'acquire_verifactu_chain_lock_v2',
        'release_verifactu_chain_lock',
        'release_verifactu_chain_lock_v2',
        'log_integration_error',                 -- sync-google-calendar (service role)
        'handle_google_webhook_debounce',        -- google-calendar-webhook (service role)
        'seed_ai_document_defaults_for_center',  -- trigger al crear centro
        'seed_ai_prompt_versions_for_center',
        '_calculate_professional_variable_amount_internal' -- generate-professional-payments
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Solo la usa el trigger protect_invoice_items_immutability (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.assert_invoice_items_mutable(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_invoice_items_mutable(uuid, text) TO service_role;
