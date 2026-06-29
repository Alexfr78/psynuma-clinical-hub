-- Foundation for patient/session payment rules and cancellation policy workflow.

-- Payment modes can be defined at center, patient, and session level.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS payment_mode text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS require_advance_payment_always boolean DEFAULT false,
  ADD CONSTRAINT patients_payment_mode_check
    CHECK (payment_mode IS NULL OR payment_mode IN ('required_now', 'in_session', 'post_session', 'scheduled_before'));

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS default_advance_payment_limit_hours integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS auto_cancel_unpaid_advance_sessions boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS unpaid_advance_cancellation_alert_threshold integer DEFAULT 2;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS advance_payment_limit_hours integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_payment_due_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_payment_notification_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_payment_notification_failed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS advance_payment_notification_error text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cancelled_for_non_payment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancellation_origin text DEFAULT NULL,
  ADD CONSTRAINT sessions_payment_mode_check
    CHECK (payment_mode IS NULL OR payment_mode IN ('required_now', 'in_session', 'post_session', 'scheduled_before')),
  ADD CONSTRAINT sessions_cancellation_origin_check
    CHECK (cancellation_origin IS NULL OR cancellation_origin IN ('patient', 'professional', 'system'));

CREATE INDEX IF NOT EXISTS idx_sessions_advance_payment_due
  ON public.sessions(center_id, advance_payment_due_at)
  WHERE status = 'scheduled'
    AND payment_status IN ('pending', 'reminder_sent', 'overdue')
    AND advance_payment_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_cancelled_for_non_payment_patient
  ON public.sessions(patient_id)
  WHERE cancelled_for_non_payment = true;

-- Public bono templates are available for patient self-purchase.
ALTER TABLE public.bono_templates
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Cancellation policies are versioned per center. The generated consent keeps
-- the signed legal snapshot; this table keeps the structured rules.
CREATE TABLE IF NOT EXISTS public.cancellation_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  version_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  penalty_invoice_concept text NOT NULL DEFAULT 'Cancelación fuera de plazo según política aceptada',
  rectification_reason text NOT NULL DEFAULT 'Devolución por cancelación de cita',
  voucher_validity_days integer NOT NULL DEFAULT 365,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(center_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_cancellation_policy_versions_center_active
  ON public.cancellation_policy_versions(center_id, is_active);

ALTER TABLE public.cancellation_policy_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cancellation policies from their center"
  ON public.cancellation_policy_versions
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins can manage cancellation policies from their center"
  ON public.cancellation_policy_versions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin') AND center_id = public.get_user_center_id(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND center_id = public.get_user_center_id(auth.uid()));

-- Link signed consents to the cancellation policy version that generated them.
ALTER TABLE public.consents
  ADD COLUMN IF NOT EXISTS cancellation_policy_version_id uuid
    REFERENCES public.cancellation_policy_versions(id) ON DELETE SET NULL;

-- Store which cancellation policy version applies to a session at the time it
-- is created/updated. This preserves the patient-specific accepted version.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS cancellation_policy_version_id uuid
    REFERENCES public.cancellation_policy_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_policy_status text DEFAULT NULL,
  ADD CONSTRAINT sessions_cancellation_policy_status_check
    CHECK (cancellation_policy_status IS NULL OR cancellation_policy_status IN ('signed', 'not_signed', 'pending_signature', 'outdated'));

-- Charges created by cancellation review. They are not debts until confirmed.
CREATE TABLE IF NOT EXISTS public.cancellation_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  policy_version_id uuid REFERENCES public.cancellation_policy_versions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'confirmed', 'forgiven', 'paid', 'cancelled')),
  amount numeric(10,2) NOT NULL DEFAULT 0,
  original_amount numeric(10,2) NOT NULL DEFAULT 0,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  base_session_price numeric(10,2) NOT NULL DEFAULT 0,
  concept text NOT NULL DEFAULT 'Penalización por cancelación fuera de plazo',
  review_note text,
  debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_charges_center_status
  ON public.cancellation_charges(center_id, status);

CREATE INDEX IF NOT EXISTS idx_cancellation_charges_patient
  ON public.cancellation_charges(patient_id, created_at DESC);

ALTER TABLE public.cancellation_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cancellation charges from their center"
  ON public.cancellation_charges
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Users can manage cancellation charges from their center"
  ON public.cancellation_charges
  FOR ALL
  USING (center_id = public.get_user_center_id(auth.uid()))
  WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

-- Reuse the common updated_at trigger where available.
DROP TRIGGER IF EXISTS update_cancellation_policy_versions_updated_at ON public.cancellation_policy_versions;
CREATE TRIGGER update_cancellation_policy_versions_updated_at
  BEFORE UPDATE ON public.cancellation_policy_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_cancellation_charges_updated_at ON public.cancellation_charges;
CREATE TRIGGER update_cancellation_charges_updated_at
  BEFORE UPDATE ON public.cancellation_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
