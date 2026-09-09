ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS stripe_payment_confirmation_sent_at timestamptz;

COMMENT ON COLUMN public.sessions.stripe_payment_confirmation_sent_at IS
  'Timestamp used to claim the patient booking confirmation after a successful Stripe payment.';
