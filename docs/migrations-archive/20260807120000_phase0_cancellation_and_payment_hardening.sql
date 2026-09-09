-- Phase 0: preserve cancellation intent, remove legacy payment-mode naming,
-- and make cancellation charge confirmation idempotent and transactional.

-- Drop the legacy checks before translating their legacy value. PostgreSQL
-- validates UPDATEs against the current constraint immediately.
ALTER TABLE public.professional_integrations
  DROP CONSTRAINT IF EXISTS professional_integrations_stripe_payment_mode_check;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_stripe_payment_mode_check;

UPDATE public.professional_integrations
SET stripe_payment_mode = 'post_session'
WHERE stripe_payment_mode = 'post_pay';

UPDATE public.sessions
SET payment_mode = 'post_session'
WHERE payment_mode = 'post_pay';

UPDATE public.sessions
SET stripe_payment_mode = 'post_session'
WHERE stripe_payment_mode = 'post_pay';

ALTER TABLE public.professional_integrations
  ALTER COLUMN stripe_payment_mode SET DEFAULT 'post_session',
  ADD CONSTRAINT professional_integrations_stripe_payment_mode_check
    CHECK (stripe_payment_mode IN ('required_now', 'post_session', 'scheduled_before'));

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_stripe_payment_mode_check
    CHECK (stripe_payment_mode IS NULL OR stripe_payment_mode IN ('required_now', 'post_session', 'scheduled_before'));

WITH duplicate_pending AS (
  SELECT id, row_number() OVER (
    PARTITION BY session_id ORDER BY created_at, id
  ) AS duplicate_number
  FROM public.cancellation_charges
  WHERE session_id IS NOT NULL AND status = 'pending_review'
)
UPDATE public.cancellation_charges AS charge
SET status = 'cancelled',
    review_note = concat_ws(E'\n', charge.review_note, 'Duplicado cerrado durante la migración de fase 0.')
FROM duplicate_pending
WHERE charge.id = duplicate_pending.id AND duplicate_pending.duplicate_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS cancellation_charges_one_active_per_session
  ON public.cancellation_charges(session_id)
  WHERE session_id IS NOT NULL
    AND status = 'pending_review';

CREATE OR REPLACE FUNCTION public.confirm_cancellation_charge(
  p_charge_id uuid,
  p_amount numeric,
  p_review_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.cancellation_charges%ROWTYPE;
  v_debt_id uuid;
  v_notes text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  SELECT * INTO v_charge
  FROM public.cancellation_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF NOT FOUND OR v_charge.center_id <> public.get_user_center_id(auth.uid()) THEN
    RAISE EXCEPTION 'Cargo no encontrado';
  END IF;
  IF v_charge.status IN ('confirmed', 'paid') AND v_charge.debt_id IS NOT NULL THEN
    RETURN v_charge.debt_id;
  END IF;
  IF v_charge.status <> 'pending_review' THEN
    RAISE EXCEPTION 'El cargo ya no está pendiente de revisión';
  END IF;

  v_notes := concat_ws(E'\n',
    v_charge.concept,
    'Origen: cancelación fuera de plazo según política aceptada.',
    format('Importe revisado: %s EUR. Importe estimado inicial: %s EUR.',
      round(p_amount, 2), round(coalesce(v_charge.original_amount, v_charge.amount), 2)),
    format('Cálculo inicial: %s%% de %s EUR.', v_charge.percentage, v_charge.base_session_price),
    CASE WHEN nullif(btrim(p_review_note), '') IS NOT NULL
      THEN 'Resolución profesional: ' || btrim(p_review_note)
      ELSE NULL
    END
  );

  INSERT INTO public.debts (
    center_id, patient_id, session_id, amount, paid_amount, status, notes
  ) VALUES (
    v_charge.center_id, v_charge.patient_id, v_charge.session_id,
    round(p_amount, 2), 0, 'pending', v_notes
  )
  RETURNING id INTO v_debt_id;

  UPDATE public.cancellation_charges
  SET status = 'confirmed', amount = round(p_amount, 2), debt_id = v_debt_id,
      review_note = coalesce(nullif(btrim(p_review_note), ''), review_note),
      reviewed_by = auth.uid(), reviewed_at = now()
  WHERE id = p_charge_id;

  RETURN v_debt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_cancellation_charge(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_cancellation_charge(uuid, numeric, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  connected_account_id text,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 1,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_connected_account_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.stripe_webhook_events (
    event_id, event_type, connected_account_id, status
  ) VALUES (
    p_event_id, p_event_type, p_connected_account_id, 'processing'
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN true;
  END IF;

  SELECT * INTO v_event
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF v_event.status = 'completed'
     OR (v_event.status = 'processing' AND v_event.updated_at > now() - interval '5 minutes') THEN
    RETURN false;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing', attempts = attempts + 1, last_error = NULL, updated_at = now()
  WHERE event_id = p_event_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, text) TO service_role;
