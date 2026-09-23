-- Parejas: vínculo entre dos contactos y sesiones conjuntas.
--
-- Modelo:
--   * `patient_relationships` une dos contactos del mismo centro. Hoy solo existe
--     el tipo 'couple'; el campo queda abierto para 'family' más adelante.
--     El vínculo lo crea siempre el profesional desde la ficha: la reserva
--     pública nunca lo crea.
--   * `sessions.patient_id` sigue siendo el TITULAR (quien paga y recibe la
--     factura). `session_participants` guarda SOLO a los participantes extra, así
--     que las sesiones individuales no cambian y nada de lo existente se rompe.
--   * `recurring_series.partner_patient_id` propaga la pareja a cada sesión que
--     se genere de la serie (trigger `sync_series_partner_to_session`).

-- ─── Vínculos ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  -- Orden canónico (patient_a_id < patient_b_id) para que A-B y B-A sean la misma fila.
  patient_a_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_b_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  relationship_type text NOT NULL DEFAULT 'couple' CHECK (relationship_type IN ('couple')),
  default_payer_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_relationships_distinct CHECK (patient_a_id <> patient_b_id),
  CONSTRAINT patient_relationships_ordered CHECK (patient_a_id < patient_b_id),
  CONSTRAINT patient_relationships_payer_is_member CHECK (
    default_payer_patient_id IS NULL
    OR default_payer_patient_id IN (patient_a_id, patient_b_id)
  ),
  CONSTRAINT patient_relationships_unique UNIQUE (patient_a_id, patient_b_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS patient_relationships_a_idx ON public.patient_relationships (patient_a_id);
CREATE INDEX IF NOT EXISTS patient_relationships_b_idx ON public.patient_relationships (patient_b_id);
CREATE INDEX IF NOT EXISTS patient_relationships_center_idx ON public.patient_relationships (center_id);

COMMENT ON TABLE public.patient_relationships IS
  'Vínculo entre dos contactos (hoy solo pareja). patient_a_id < patient_b_id.';

-- Normaliza el orden, exige mismo centro y como mucho una pareja por contacto.
CREATE OR REPLACE FUNCTION public.validate_patient_relationship()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tmp uuid;
  v_center_a uuid;
  v_center_b uuid;
BEGIN
  IF NEW.patient_a_id > NEW.patient_b_id THEN
    v_tmp := NEW.patient_a_id;
    NEW.patient_a_id := NEW.patient_b_id;
    NEW.patient_b_id := v_tmp;
  END IF;

  SELECT center_id INTO v_center_a FROM public.patients WHERE id = NEW.patient_a_id;
  SELECT center_id INTO v_center_b FROM public.patients WHERE id = NEW.patient_b_id;
  IF v_center_a IS DISTINCT FROM NEW.center_id OR v_center_b IS DISTINCT FROM NEW.center_id THEN
    RAISE EXCEPTION 'Los dos contactos deben pertenecer al mismo centro';
  END IF;

  IF NEW.relationship_type = 'couple' AND EXISTS (
    SELECT 1 FROM public.patient_relationships r
    WHERE r.relationship_type = 'couple'
      AND r.id IS DISTINCT FROM NEW.id
      AND (r.patient_a_id IN (NEW.patient_a_id, NEW.patient_b_id)
        OR r.patient_b_id IN (NEW.patient_a_id, NEW.patient_b_id))
  ) THEN
    RAISE EXCEPTION 'Uno de los contactos ya tiene una pareja vinculada';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_patient_relationship ON public.patient_relationships;
CREATE TRIGGER validate_patient_relationship
  BEFORE INSERT OR UPDATE ON public.patient_relationships
  FOR EACH ROW EXECUTE FUNCTION public.validate_patient_relationship();

DROP TRIGGER IF EXISTS patient_relationships_updated_at ON public.patient_relationships;
CREATE TRIGGER patient_relationships_updated_at
  BEFORE UPDATE ON public.patient_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.patient_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View relationships in center" ON public.patient_relationships
  FOR SELECT TO authenticated
  USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage relationships in center" ON public.patient_relationships
  FOR ALL TO authenticated
  USING (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())))
  WITH CHECK (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())));

REVOKE ALL ON TABLE public.patient_relationships FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.patient_relationships TO authenticated;
GRANT ALL ON TABLE public.patient_relationships TO service_role;

-- ─── Participantes extra de una sesión ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_participants (
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, patient_id)
);

CREATE INDEX IF NOT EXISTS session_participants_patient_idx ON public.session_participants (patient_id);

COMMENT ON TABLE public.session_participants IS
  'Participantes adicionales al titular (sessions.patient_id). Una sesión individual no tiene filas aquí.';

CREATE OR REPLACE FUNCTION public.validate_session_participant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_session_center uuid;
  v_session_patient uuid;
  v_patient_center uuid;
BEGIN
  SELECT center_id, patient_id INTO v_session_center, v_session_patient
  FROM public.sessions WHERE id = NEW.session_id;
  SELECT center_id INTO v_patient_center FROM public.patients WHERE id = NEW.patient_id;

  IF v_session_center IS NULL OR v_session_center <> NEW.center_id OR v_patient_center <> NEW.center_id THEN
    RAISE EXCEPTION 'Sesión y participante deben pertenecer al mismo centro';
  END IF;
  IF v_session_patient = NEW.patient_id THEN
    RAISE EXCEPTION 'El titular de la sesión no se añade como participante';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_session_participant ON public.session_participants;
CREATE TRIGGER validate_session_participant
  BEFORE INSERT OR UPDATE ON public.session_participants
  FOR EACH ROW EXECUTE FUNCTION public.validate_session_participant();

-- Si el titular pasa a ser el antiguo participante (cambio de pagador), el
-- participante se convierte en el titular anterior en lugar de duplicarse.
CREATE OR REPLACE FUNCTION public.swap_participant_on_payer_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.patient_id IS DISTINCT FROM OLD.patient_id THEN
    UPDATE public.session_participants
       SET patient_id = OLD.patient_id
     WHERE session_id = NEW.id AND patient_id = NEW.patient_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS swap_participant_on_payer_change ON public.sessions;
CREATE TRIGGER swap_participant_on_payer_change
  AFTER UPDATE OF patient_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.swap_participant_on_payer_change();

ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View session participants in center" ON public.session_participants
  FOR SELECT TO authenticated
  USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage session participants in center" ON public.session_participants
  FOR ALL TO authenticated
  USING (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())))
  WITH CHECK (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())));

REVOKE ALL ON TABLE public.session_participants FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_participants TO authenticated;
GRANT ALL ON TABLE public.session_participants TO service_role;

-- Titular + participantes de una sesión (para avisos, portal y consentimientos).
CREATE OR REPLACE FUNCTION public.get_session_patient_ids(p_session_id uuid)
RETURNS TABLE (patient_id uuid, is_payer boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.patient_id, true FROM public.sessions s WHERE s.id = p_session_id
  UNION
  SELECT sp.patient_id, false FROM public.session_participants sp WHERE sp.session_id = p_session_id;
$$;

REVOKE ALL ON FUNCTION public.get_session_patient_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_patient_ids(uuid) TO service_role;

-- ─── Tipos de sesión de pareja ───────────────────────────────────────────────
ALTER TABLE public.session_types ADD COLUMN IF NOT EXISTS is_couple boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.session_types.is_couple IS
  'Sesión conjunta de pareja: al elegir este tipo se pide el segundo miembro.';

-- Los tipos existentes llamados "pareja" se marcan como tales.
UPDATE public.session_types SET is_couple = true WHERE name ILIKE '%pareja%' AND is_couple = false;

-- ─── Series recurrentes de pareja ────────────────────────────────────────────
ALTER TABLE public.recurring_series
  ADD COLUMN IF NOT EXISTS partner_patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.sync_series_partner_to_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid;
BEGIN
  IF NEW.recurring_series_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT partner_patient_id INTO v_partner FROM public.recurring_series WHERE id = NEW.recurring_series_id;
  IF v_partner IS NOT NULL AND v_partner <> NEW.patient_id THEN
    INSERT INTO public.session_participants (session_id, patient_id, center_id)
    VALUES (NEW.id, v_partner, NEW.center_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_series_partner_to_session ON public.sessions;
CREATE TRIGGER sync_series_partner_to_session
  AFTER INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_series_partner_to_session();

REVOKE ALL ON FUNCTION public.sync_series_partner_to_session() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.swap_participant_on_payer_change() FROM PUBLIC, anon, authenticated;
