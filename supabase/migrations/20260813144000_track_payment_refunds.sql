ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_refunded_amount_valid'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_refunded_amount_valid
      CHECK (refunded_amount >= 0 AND refunded_amount <= amount);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge_id
  ON public.payments(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- Reconcile Stripe refunds that were processed before payments tracked refunds.
UPDATE public.payments AS payment
SET status = 'refunded',
    refunded_amount = payment.amount,
    refunded_at = COALESCE(debt.updated_at, now())
FROM public.debts AS debt
WHERE payment.reference = debt.stripe_checkout_session_id
  AND payment.payment_method = 'stripe'
  AND debt.stripe_payment_status = 'refunded';

UPDATE public.payments AS payment
SET status = 'refunded',
    refunded_amount = payment.amount,
    refunded_at = COALESCE(session.updated_at, now())
FROM public.sessions AS session
WHERE payment.reference = session.stripe_checkout_session_id
  AND payment.payment_method = 'stripe'
  AND session.stripe_payment_status = 'refunded'
  AND payment.status <> 'refunded';

-- Refunded debts are no longer part of the outstanding or collected balance.
UPDATE public.debts
SET paid_amount = 0
WHERE status = 'refunded'
  AND stripe_payment_status = 'refunded'
  AND paid_amount <> 0;
