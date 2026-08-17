BEGIN;

-- ============================================================================
-- Fase 2 · Incremento 1 — Tarjeta en archivo para cargos por cancelación
-- ----------------------------------------------------------------------------
-- Guarda ÚNICAMENTE identificadores de Stripe (nunca el número de tarjeta/PAN).
-- La tarjeta se captura vía Stripe Checkout en modo `setup` sobre la cuenta
-- conectada del profesional. El cobro off-session real llega en el Incremento 2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Identificadores de Stripe (viven en la cuenta CONECTADA del profesional).
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  connected_account_id text NOT NULL,
  -- Datos no sensibles para mostrar en la UI.
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  -- Evidencia del mandato SCA (se reutiliza el clickwrap de la política).
  mandate_policy_version_id uuid REFERENCES public.cancellation_policy_versions(id) ON DELETE SET NULL,
  mandate_accepted_at timestamptz,
  mandate_ip text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_payment_methods_center_patient_status
  ON public.patient_payment_methods(center_id, patient_id, status);

-- Como máximo una tarjeta ACTIVA por paciente y cuenta conectada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_payment_methods_active
  ON public.patient_payment_methods(patient_id, connected_account_id)
  WHERE status = 'active';

ALTER TABLE public.patient_payment_methods ENABLE ROW LEVEL SECURITY;

-- Lectura para el personal del centro (profesionales/admin). Las escrituras
-- las hace el webhook / edge functions con service_role (bypass RLS); no se
-- exponen políticas de escritura al cliente para no filtrar datos de pago.
CREATE POLICY "Center staff can view patient payment methods"
  ON public.patient_payment_methods FOR SELECT
  TO authenticated
  USING (center_id = public.get_user_center_id(auth.uid()));

GRANT SELECT ON public.patient_payment_methods TO authenticated;
GRANT ALL ON public.patient_payment_methods TO service_role;

COMMENT ON TABLE public.patient_payment_methods IS
  'Tarjetas en archivo (solo ids de Stripe) para cargos por cancelación/no-show. Captura vía Checkout mode=setup en la cuenta conectada del profesional.';

-- Config del centro: si se pide/guarda tarjeta en la reserva. Solo aplica
-- cuando cancellation_policy_enabled = true.
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS card_on_booking_mode text NOT NULL DEFAULT 'off'
  CHECK (card_on_booking_mode IN ('off', 'optional', 'required'));

COMMENT ON COLUMN public.centers.card_on_booking_mode IS
  'Captura de tarjeta en la reserva: off | optional | required. Solo se evalúa si cancellation_policy_enabled = true.';

COMMIT;
