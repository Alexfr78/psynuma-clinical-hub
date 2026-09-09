-- Production guardrail: expose Sandbox references for an explicit, reversible
-- cleanup of checkout columns. This migration does not modify business data.

CREATE OR REPLACE FUNCTION public.report_sandbox_stripe_references()
RETURNS TABLE (
  source_table text,
  record_id uuid,
  stripe_reference text,
  payment_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'sessions', id, stripe_checkout_session_id, stripe_payment_status
  FROM public.sessions
  WHERE stripe_checkout_session_id LIKE 'cs_test_%'
  UNION ALL
  SELECT 'debts', id, stripe_checkout_session_id, stripe_payment_status
  FROM public.debts
  WHERE stripe_checkout_session_id LIKE 'cs_test_%'
  UNION ALL
  SELECT 'bonos', id, stripe_checkout_session_id, NULL::text
  FROM public.bonos
  WHERE stripe_checkout_session_id LIKE 'cs_test_%'
  UNION ALL
  SELECT 'payments', id, reference, status
  FROM public.payments
  WHERE reference LIKE 'cs_test_%';
$$;

CREATE OR REPLACE FUNCTION public.cleanup_sandbox_stripe_checkout_references(
  confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sessions_cleaned integer := 0;
  debts_cleaned integer := 0;
  bonos_cleaned integer := 0;
BEGIN
  IF confirmation <> 'CONFIRM_LIVE_STRIPE_SANDBOX_CLEANUP' THEN
    RAISE EXCEPTION 'Explicit cleanup confirmation required';
  END IF;

  UPDATE public.sessions
  SET stripe_checkout_session_id = NULL,
      stripe_payment_status = CASE
        WHEN stripe_payment_status IN ('paid', 'refunded') THEN stripe_payment_status
        ELSE NULL
      END
  WHERE stripe_checkout_session_id LIKE 'cs_test_%';
  GET DIAGNOSTICS sessions_cleaned = ROW_COUNT;

  UPDATE public.debts
  SET stripe_checkout_session_id = NULL,
      stripe_payment_status = CASE
        WHEN stripe_payment_status IN ('paid', 'refunded') THEN stripe_payment_status
        ELSE NULL
      END
  WHERE stripe_checkout_session_id LIKE 'cs_test_%';
  GET DIAGNOSTICS debts_cleaned = ROW_COUNT;

  UPDATE public.bonos
  SET stripe_checkout_session_id = NULL
  WHERE stripe_checkout_session_id LIKE 'cs_test_%';
  GET DIAGNOSTICS bonos_cleaned = ROW_COUNT;

  -- payments.reference is intentionally left untouched: it is a financial
  -- audit reference and requires manual reconciliation before any change.
  RETURN jsonb_build_object(
    'sessions_cleaned', sessions_cleaned,
    'debts_cleaned', debts_cleaned,
    'bonos_cleaned', bonos_cleaned,
    'payments_requiring_manual_review', (
      SELECT count(*) FROM public.payments WHERE reference LIKE 'cs_test_%'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.report_sandbox_stripe_references() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_sandbox_stripe_checkout_references(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sandbox_stripe_references() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_sandbox_stripe_checkout_references(text) TO service_role;
