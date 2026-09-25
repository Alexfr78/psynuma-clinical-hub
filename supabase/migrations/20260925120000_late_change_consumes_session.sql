-- Cambio tardío = sesión consumida.
--
-- Cuando el paciente cancela o reprograma con menos antelación que la ventana de
-- la política firmada, se crea un cargo (aunque sea de 0 €, p. ej. una primera
-- consulta gratuita). Ese cargo pasa a contar para el máximo por servicio
-- (session_types.max_per_patient): la sesión se da por consumida. Si el centro
-- perdona o anula el cargo (forgiven / cancelled), deja de contar.
--
-- origin distingue de dónde viene el cargo:
--   cancel      cancelación tardía (la sesión queda cancelada)
--   reschedule  reprogramación tardía (la sesión sigue viva en su nueva fecha,
--               así que la original consumida se suma aparte)
--   no_show     inasistencia (la sesión ya cuenta por su estado)

ALTER TABLE public.cancellation_charges
  ADD COLUMN IF NOT EXISTS origin text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cancellation_charges_origin_check') THEN
    ALTER TABLE public.cancellation_charges
      ADD CONSTRAINT cancellation_charges_origin_check
      CHECK (origin IS NULL OR origin IN ('cancel', 'reschedule', 'no_show'));
  END IF;
END $$;

-- Cargos existentes: se deduce el origen de la nota y del estado de la sesión.
UPDATE public.cancellation_charges c
   SET origin = CASE
     WHEN c.review_note ILIKE 'No presentado%' THEN 'no_show'
     WHEN c.review_note ILIKE 'Reprogramaci%' OR c.concept ILIKE '%reprogramaci%' THEN 'reschedule'
     ELSE 'cancel'
   END
 WHERE c.origin IS NULL;

-- Arreglo de la nota con el acento mal codificado que dejaba el portal.
UPDATE public.cancellation_charges
   SET review_note = replace(review_note, 'CancelaciÃ³n', 'Cancelación')
 WHERE review_note LIKE '%CancelaciÃ³n%';

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

  WITH patient_sessions AS (
    SELECT s.id, s.status
      FROM sessions s
     WHERE s.center_id = v_type.center_id
       AND (
         s.patient_id = p_patient_id
         OR EXISTS (
           SELECT 1 FROM session_participants sp
            WHERE sp.session_id = s.id AND sp.patient_id = p_patient_id
         )
       )
       -- La reserva pública y el portal solo guardan el nombre del servicio.
       AND (
         s.session_type_id = v_type.id
         OR (s.session_type_id IS NULL AND lower(s.session_type) = lower(v_type.name))
       )
       AND (p_exclude_session_id IS NULL OR s.id <> p_exclude_session_id)
       AND (v_from IS NULL OR (s.session_date > v_from AND s.session_date < v_to))
  )
  SELECT
    -- Citas vivas o ya ocurridas.
    (SELECT count(*) FROM patient_sessions ps
      WHERE ps.status IN (
        'scheduled', 'confirmed', 'completed', 'no_show',
        'pending_approval', 'reschedule_requested'
      ))
    +
    -- Sesiones consumidas por un cambio tardío con cargo no perdonado.
    (SELECT count(*) FROM cancellation_charges c
       JOIN patient_sessions ps ON ps.id = c.session_id
      WHERE c.status IN ('pending_review', 'confirmed', 'paid')
        AND (
          (c.origin = 'cancel' AND ps.status = 'cancelled')
          OR c.origin = 'reschedule'
        ))
    INTO v_used;

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

