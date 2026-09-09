-- =============================================
-- MIGRACIÓN: Lista de Espera + Derivaciones (Wizard)
-- =============================================

-- A) Extender tabla portal_intake_requests con nuevas columnas
ALTER TABLE public.portal_intake_requests
  ADD COLUMN IF NOT EXISTS privacy_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS privacy_policy_url text NULL,
  ADD COLUMN IF NOT EXISTS specialty text NULL,
  ADD COLUMN IF NOT EXISTS referral_context jsonb NULL,
  ADD COLUMN IF NOT EXISTS recommended_partner_ids uuid[] NULL,
  ADD COLUMN IF NOT EXISTS selected_partner_id uuid NULL,
  ADD COLUMN IF NOT EXISTS handled_by uuid NULL,
  ADD COLUMN IF NOT EXISTS handled_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text NULL;

-- Añadir FK para handled_by (profesional que gestiona)
ALTER TABLE public.portal_intake_requests
  DROP CONSTRAINT IF EXISTS portal_intake_requests_handled_by_fkey;

ALTER TABLE public.portal_intake_requests
  ADD CONSTRAINT portal_intake_requests_handled_by_fkey
  FOREIGN KEY (handled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- B) Crear tabla referral_partners (profesionales de confianza)
CREATE TABLE IF NOT EXISTS public.referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  surname text NULL,
  public_name text NULL,
  email text NULL,
  phone text NULL,
  website text NULL,
  modality text[] NOT NULL DEFAULT '{}',
  provinces text[] NULL,
  cities text[] NULL,
  specialties text[] NULL,
  description text NULL,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- C) Crear tabla referral_specialties (catálogo por centro)
CREATE TABLE IF NOT EXISTS public.referral_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  priority int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- D) Índices
CREATE INDEX IF NOT EXISTS idx_portal_intake_requests_center_type_status
  ON public.portal_intake_requests(center_id, request_type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_partners_center_active_priority
  ON public.referral_partners(center_id, active, priority);

CREATE INDEX IF NOT EXISTS idx_referral_specialties_center_active_priority
  ON public.referral_specialties(center_id, active, priority);

-- E) RLS para referral_partners
ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view referral partners of their center"
  ON public.referral_partners
  FOR SELECT
  TO authenticated
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins and professionals can insert referral partners"
  ON public.referral_partners
  FOR INSERT
  TO authenticated
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

CREATE POLICY "Admins and professionals can update referral partners"
  ON public.referral_partners
  FOR UPDATE
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

CREATE POLICY "Admins can delete referral partners"
  ON public.referral_partners
  FOR DELETE
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  );

-- RLS para referral_specialties
ALTER TABLE public.referral_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view referral specialties of their center"
  ON public.referral_specialties
  FOR SELECT
  TO authenticated
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins and professionals can insert referral specialties"
  ON public.referral_specialties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

CREATE POLICY "Admins and professionals can update referral specialties"
  ON public.referral_specialties
  FOR UPDATE
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

CREATE POLICY "Admins can delete referral specialties"
  ON public.referral_specialties
  FOR DELETE
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  );

-- Actualizar RLS de portal_intake_requests para gestión backend
CREATE POLICY "Users can view intake requests of their center"
  ON public.portal_intake_requests
  FOR SELECT
  TO authenticated
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins and professionals can update intake requests"
  ON public.portal_intake_requests
  FOR UPDATE
  TO authenticated
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

-- Triggers para updated_at
CREATE OR REPLACE TRIGGER update_referral_partners_updated_at
  BEFORE UPDATE ON public.referral_partners
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_referral_specialties_updated_at
  BEFORE UPDATE ON public.referral_specialties
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();