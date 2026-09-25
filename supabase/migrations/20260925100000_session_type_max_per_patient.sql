-- Límite de veces que un mismo paciente puede tener un servicio (p. ej. la
-- primera consulta solo una vez).
--
--   max_per_patient                NULL = sin límite; N = como mucho N citas.
--   max_per_patient_period_months  0 = para siempre; M = ventana de M meses
--                                  alrededor de la fecha de la cita nueva.
--
-- Cuentan las citas programadas, confirmadas, realizadas, pendientes de
-- aprobación o de reprogramar y los no-show (faltar también consume el
-- servicio). No cuentan las canceladas, borradores ni bloqueos. Las sesiones de
-- pareja cuentan para los dos miembros (session_participants).
--
-- La reserva pública y el portal bloquean al superar el límite; la agenda
-- interna solo avisa.

ALTER TABLE public.session_types
  ADD COLUMN IF NOT EXISTS max_per_patient integer,
  ADD COLUMN IF NOT EXISTS max_per_patient_period_months integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_types_max_per_patient_check') THEN
    ALTER TABLE public.session_types
      ADD CONSTRAINT session_types_max_per_patient_check
      CHECK (max_per_patient IS NULL OR max_per_patient >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_types_max_per_patient_period_check') THEN
    ALTER TABLE public.session_types
      ADD CONSTRAINT session_types_max_per_patient_period_check
      CHECK (max_per_patient_period_months >= 0);
  END IF;
END $$;

-- SECURITY DEFINER para que el aviso de la agenda cuente también las citas con
-- otros profesionales del centro, aunque RLS no se las deje ver a quien llama.
-- Por eso se comprueba a mano que el usuario pertenece al centro del servicio.
CREATE OR REPLACE FUNCTION public.check_session_type_limit(
  p_patient_id uuid,
  p_session_type_id uuid,
  p_session_date date DEFAULT NULL,
  p_exclude_session_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type record;
  v_date date := coalesce(p_session_date, current_date);
  v_from date;
  v_to date;
  v_used integer;
BEGIN
  SELECT id, center_id, name, max_per_patient, max_per_patient_period_months
    INTO v_type
    FROM session_types
   WHERE id = p_session_type_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('limited', false, 'allowed', true);
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND center_id = v_type.center_id
  ) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_type.max_per_patient IS NULL THEN
    RETURN jsonb_build_object('limited', false, 'allowed', true);
  END IF;

  IF v_type.max_per_patient_period_months > 0 THEN
    v_from := (v_date - make_interval(months => v_type.max_per_patient_period_months))::date;
    v_to   := (v_date + make_interval(months => v_type.max_per_patient_period_months))::date;
  END IF;

  SELECT count(*)
    INTO v_used
    FROM sessions s
   WHERE s.center_id = v_type.center_id
     AND (
       s.patient_id = p_patient_id
       OR EXISTS (
         SELECT 1 FROM session_participants sp
          WHERE sp.session_id = s.id AND sp.patient_id = p_patient_id
       )
     )
     -- Las citas antiguas solo guardan el nombre del servicio.
     AND (
       s.session_type_id = v_type.id
       OR (s.session_type_id IS NULL AND s.session_type = v_type.name)
     )
     AND s.status IN (
       'scheduled', 'confirmed', 'completed', 'no_show',
       'pending_approval', 'reschedule_requested'
     )
     AND (p_exclude_session_id IS NULL OR s.id <> p_exclude_session_id)
     AND (v_from IS NULL OR (s.session_date > v_from AND s.session_date < v_to));

  RETURN jsonb_build_object(
    'limited', true,
    'allowed', v_used < v_type.max_per_patient,
    'used', v_used,
    'max', v_type.max_per_patient,
    'period_months', v_type.max_per_patient_period_months,
    'session_type_name', v_type.name
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.check_session_type_limit(uuid, uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_session_type_limit(uuid, uuid, date, uuid) TO authenticated, service_role;
