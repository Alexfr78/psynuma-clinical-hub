BEGIN;

-- ============================================================================
-- Fase 2 · Incremento 2a — Cobro off-session del cargo por cancelación
-- ----------------------------------------------------------------------------
-- Guarda el identificador del PaymentIntent del cobro merchant-initiated y el
-- error de Stripe cuando el cobro off-session no prospera (3DS / declinada),
-- caso en el que se cae al fallback de deuda + enlace de pago.
-- ============================================================================

ALTER TABLE public.cancellation_charges
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS off_session_error text;

COMMENT ON COLUMN public.cancellation_charges.stripe_payment_intent_id IS
  'PaymentIntent del cobro off-session a la tarjeta guardada (Inc 2a).';
COMMENT ON COLUMN public.cancellation_charges.off_session_error IS
  'Motivo por el que el cobro off-session no prosperó (3DS/declinada); se cae al fallback de deuda + enlace.';

COMMIT;
