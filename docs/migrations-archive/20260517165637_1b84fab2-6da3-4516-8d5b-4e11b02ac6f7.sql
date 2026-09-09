CREATE OR REPLACE FUNCTION public.convert_calendar_event_to_session(
  p_calendar_event_id uuid,
  p_patient_id uuid,
  p_session_type text,
  p_price numeric,
  p_session_modality text DEFAULT 'in_person'::text,
  p_location_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text,
  p_bono_id uuid DEFAULT NULL::uuid,
  p_session_type_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_session_id uuid;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_center_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.calendar_events
  WHERE id = p_calendar_event_id AND is_converted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento no encontrado o ya convertido';
  END IF;

  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_event.professional_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el centro del profesional';
  END IF;

  v_session_date := DATE(v_event.start_at AT TIME ZONE 'Europe/Madrid');
  v_start_time := (v_event.start_at AT TIME ZONE 'Europe/Madrid')::time;
  v_end_time := (v_event.end_at AT TIME ZONE 'Europe/Madrid')::time;

  INSERT INTO public.sessions (
    center_id, patient_id, professional_id, session_date, start_time, end_time,
    session_type, session_type_id, price, status, session_modality, location_id, notes, bono_id,
    google_calendar_event_id
  ) VALUES (
    v_center_id, p_patient_id, v_event.professional_id, v_session_date, v_start_time, v_end_time,
    p_session_type, p_session_type_id, p_price, 'scheduled', p_session_modality, p_location_id,
    COALESCE(p_notes, 'Convertido desde: ' || COALESCE(v_event.summary, 'Evento externo')),
    p_bono_id, v_event.google_event_id
  ) RETURNING id INTO v_session_id;

  UPDATE public.calendar_events SET
    is_converted = true,
    converted_session_id = v_session_id,
    converted_at = now()
  WHERE id = p_calendar_event_id;

  RETURN v_session_id;
END;
$function$;

-- Backfill: link existing session created from calendar event with session_type_id matching name
UPDATE public.sessions s
SET session_type_id = st.id
FROM public.session_types st
WHERE s.session_type_id IS NULL
  AND st.center_id = s.center_id
  AND lower(st.name) = lower(s.session_type);