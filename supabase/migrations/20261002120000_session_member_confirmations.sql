-- Confirmación de asistencia por miembro y cambio de titular en sesiones de pareja.
--
--   * `session_member_confirmations` guarda QUIÉN confirma una cita y por qué canal.
--     En una sesión de pareja `sessions.status` solo pasa a 'confirmed' cuando han
--     confirmado los dos; mientras tanto la agenda la muestra como "1/2".
--     Una sesión individual se confirma con una sola fila, como hasta ahora.
--   * Si la cita cambia de fecha u hora, las confirmaciones se borran (hay que
--     volver a confirmar la nueva hora). Si un miembro sale de la sesión, se borra
--     la suya.
--   * `swap_couple_session_payer` cambia el titular (quien paga) de una sesión de
--     pareja ya creada. El trigger `swap_participant_on_payer_change` ya mueve al
--     antiguo titular a `session_participants`.

-- ─── Confirmaciones por miembro ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_member_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- 'professional': lo confirmó el equipo desde la agenda; 'system': otro proceso
  -- (p. ej. un pago) pasó la cita a confirmada.
  via text NOT NULL CHECK (via IN ('session_link', 'portal', 'whatsapp', 'professional', 'system')),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_member_confirmations_unique UNIQUE (session_id, patient_id)
);

CREATE INDEX IF NOT EXISTS session_member_confirmations_patient_idx
  ON public.session_member_confirmations (patient_id);

COMMENT ON TABLE public.session_member_confirmations IS
  'Quién ha confirmado asistencia a una cita y por qué canal. En pareja, la sesión pasa a confirmed cuando confirman los dos.';

ALTER TABLE public.session_member_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View member confirmations in center" ON public.session_member_confirmations;
CREATE POLICY "View member confirmations in center" ON public.session_member_confirmations
  FOR SELECT TO authenticated
  USING (center_id = get_user_center_id(auth.uid()));

DROP POLICY IF EXISTS "Manage member confirmations in center" ON public.session_member_confirmations;
CREATE POLICY "Manage member confirmations in center" ON public.session_member_confirmations
  FOR ALL TO authenticated
  USING (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())))
  WITH CHECK (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())));

REVOKE ALL ON TABLE public.session_member_confirmations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_member_confirmations TO authenticated;
GRANT ALL ON TABLE public.session_member_confirmations TO service_role;

-- Cambio de fecha u hora → hay que volver a confirmar.
CREATE OR REPLACE FUNCTION public.reset_member_confirmations_on_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.session_date IS DISTINCT FROM OLD.session_date
     OR NEW.start_time IS DISTINCT FROM OLD.start_time THEN
    DELETE FROM public.session_member_confirmations WHERE session_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reset_member_confirmations_on_reschedule ON public.sessions;
CREATE TRIGGER reset_member_confirmations_on_reschedule
  AFTER UPDATE OF session_date, start_time ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.reset_member_confirmations_on_reschedule();

-- Un miembro sale de la sesión → se borra su confirmación. Si el que sale es el
-- antiguo titular, el trigger de cambio de titular ya lo ha movido a participantes.
CREATE OR REPLACE FUNCTION public.drop_member_confirmation_on_participant_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.session_member_confirmations
   WHERE session_id = OLD.session_id AND patient_id = OLD.patient_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS drop_member_confirmation_on_participant_delete ON public.session_participants;
CREATE TRIGGER drop_member_confirmation_on_participant_delete
  AFTER DELETE ON public.session_participants
  FOR EACH ROW EXECUTE FUNCTION public.drop_member_confirmation_on_participant_delete();

-- La cita pasa a 'confirmed' por fuera de los pacientes (agenda, pagos…) → los
-- miembros que faltaban quedan confirmados. Si vuelve a 'scheduled', se quitan
-- esas confirmaciones y se conservan las que dieron los propios pacientes.
CREATE OR REPLACE FUNCTION public.sync_member_confirmations_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status::text = 'confirmed' AND OLD.status::text IS DISTINCT FROM 'confirmed' THEN
    INSERT INTO public.session_member_confirmations (center_id, session_id, patient_id, via)
    SELECT NEW.center_id, NEW.id, m.patient_id,
           CASE WHEN auth.uid() IS NOT NULL THEN 'professional' ELSE 'system' END
      FROM (
        SELECT NEW.patient_id AS patient_id
        UNION
        SELECT sp.patient_id FROM public.session_participants sp WHERE sp.session_id = NEW.id
      ) m
     WHERE m.patient_id IS NOT NULL
    ON CONFLICT (session_id, patient_id) DO NOTHING;
  ELSIF NEW.status::text = 'scheduled' AND OLD.status::text = 'confirmed' THEN
    DELETE FROM public.session_member_confirmations
     WHERE session_id = NEW.id AND via IN ('professional', 'system');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_member_confirmations_on_status ON public.sessions;
CREATE TRIGGER sync_member_confirmations_on_status
  AFTER UPDATE OF status ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.sync_member_confirmations_on_status();

REVOKE ALL ON FUNCTION public.sync_member_confirmations_on_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_member_confirmations_on_reschedule() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_member_confirmation_on_participant_delete() FROM PUBLIC, anon, authenticated;

-- ─── Cambiar quién paga ──────────────────────────────────────────────────────
-- Motivo por el que una sesión no admite cambio de titular, o NULL si lo admite.
CREATE OR REPLACE FUNCTION public.couple_payer_swap_blocker(p_session_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = p_session_id)
      THEN 'No es una sesión de pareja'
    WHEN EXISTS (SELECT 1 FROM public.invoice_items ii WHERE ii.session_id = p_session_id)
      THEN 'La sesión ya está facturada'
    WHEN EXISTS (SELECT 1 FROM public.payments p WHERE p.session_id = p_session_id)
      THEN 'La sesión ya tiene cobros registrados'
    WHEN EXISTS (
      SELECT 1 FROM public.debts d
       WHERE d.session_id = p_session_id
         AND (d.invoice_id IS NOT NULL OR COALESCE(d.paid_amount, 0) > 0 OR d.status::text = 'paid')
    ) THEN 'La sesión ya tiene cobros registrados'
    WHEN EXISTS (
      SELECT 1 FROM public.billable_events be
       WHERE be.session_id = p_session_id AND be.billing_status <> 'pending'
    ) THEN 'La sesión ya está facturada'
    WHEN EXISTS (
      SELECT 1 FROM public.sessions s
       WHERE s.id = p_session_id
         AND (s.stripe_payment_status = 'paid' OR s.payment_status IN ('paid', 'partial'))
    ) THEN 'La sesión ya está pagada'
    WHEN EXISTS (
      SELECT 1 FROM public.couple_cancellation_requests r
       WHERE r.session_id = p_session_id AND r.status = 'pending'
    ) THEN 'Hay una cancelación de pareja pendiente de respuesta'
    ELSE NULL
  END;
$$;

-- p_scope: 'single' (solo esta sesión) | 'following' (esta y las siguientes de la serie).
-- En 'following' las sesiones bloqueadas se saltan y se devuelven contadas.
CREATE OR REPLACE FUNCTION public.swap_couple_session_payer(p_session_id uuid, p_scope text DEFAULT 'single')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_blocker text;
  v_target record;
  v_new_payer uuid;
  v_changed int := 0;
  v_skipped int := 0;
BEGIN
  IF p_scope NOT IN ('single', 'following') THEN
    RAISE EXCEPTION 'Alcance no válido';
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;
  IF v_session.center_id IS DISTINCT FROM get_user_center_id(auth.uid())
     OR NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para modificar esta sesión';
  END IF;

  -- La sesión de partida debe poder cambiarse siempre: si no, error claro.
  v_blocker := public.couple_payer_swap_blocker(p_session_id);
  IF v_blocker IS NOT NULL THEN
    RAISE EXCEPTION '%', v_blocker;
  END IF;

  FOR v_target IN
    SELECT s.id, s.patient_id
      FROM public.sessions s
     WHERE s.id = p_session_id
        OR (p_scope = 'following'
            AND v_session.recurring_series_id IS NOT NULL
            AND s.recurring_series_id = v_session.recurring_series_id
            AND s.center_id = v_session.center_id
            AND (s.session_date, s.start_time) > (v_session.session_date, v_session.start_time)
            AND s.status::text NOT IN ('completed', 'cancelled', 'no_show'))
  LOOP
    IF v_target.id <> p_session_id AND public.couple_payer_swap_blocker(v_target.id) IS NOT NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT sp.patient_id INTO v_new_payer
      FROM public.session_participants sp
     WHERE sp.session_id = v_target.id
     LIMIT 1;

    -- Deuda y evento facturable aún sin cobrar pasan al nuevo titular.
    UPDATE public.debts SET patient_id = v_new_payer
     WHERE session_id = v_target.id AND patient_id = v_target.patient_id;
    UPDATE public.billable_events SET patient_id = v_new_payer
     WHERE session_id = v_target.id AND patient_id = v_target.patient_id AND billing_status = 'pending';

    -- El trigger swap_participant_on_payer_change mueve al antiguo titular a participantes.
    UPDATE public.sessions SET patient_id = v_new_payer WHERE id = v_target.id;
    v_changed := v_changed + 1;
  END LOOP;

  -- Las sesiones que la serie genere a partir de ahora nacen con el nuevo titular.
  IF p_scope = 'following' AND v_session.recurring_series_id IS NOT NULL THEN
    UPDATE public.recurring_series
       SET patient_id = partner_patient_id,
           partner_patient_id = patient_id
     WHERE id = v_session.recurring_series_id
       AND patient_id = v_session.patient_id
       AND partner_patient_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('changed', v_changed, 'skipped', v_skipped);
END;
$$;

REVOKE ALL ON FUNCTION public.couple_payer_swap_blocker(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.couple_payer_swap_blocker(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.swap_couple_session_payer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_couple_session_payer(uuid, text) TO authenticated, service_role;
