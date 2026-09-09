ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_stripe_payment_status_check;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_stripe_payment_status_check
  CHECK (
    stripe_payment_status IN (
      'not_required',
      'pending',
      'paid',
      'failed',
      'expired',
      'refunded'
    )
  );

ALTER TABLE public.bonos
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

CREATE UNIQUE INDEX IF NOT EXISTS bonos_stripe_checkout_session_id_key
  ON public.bonos (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.bonos.stripe_checkout_session_id IS
  'Stripe Checkout identifier used to make bono fulfillment idempotent.';