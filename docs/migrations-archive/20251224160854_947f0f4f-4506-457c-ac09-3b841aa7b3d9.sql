-- Fix function search_path for security
CREATE OR REPLACE FUNCTION convert_calendar_event_to_session(
  p_calendar_event_id uuid,
  p_patient_id uuid,
  p_session_type text,
  p_price numeric,
  p_session_modality text DEFAULT 'in_person',
  p_location_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_bono_id uuid DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_event record;
  v_session_id uuid;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_center_id uuid;
BEGIN
  -- Lock and get the calendar event
  SELECT * INTO v_event FROM public.calendar_events 
  WHERE id = p_calendar_event_id AND is_converted = false
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento no encontrado o ya convertido';
  END IF;
  
  -- Get center_id from professional's profile
  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_event.professional_id;
  
  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el centro del profesional';
  END IF;
  
  -- Extract date and times from the event (in Europe/Madrid timezone)
  v_session_date := DATE(v_event.start_at AT TIME ZONE 'Europe/Madrid');
  v_start_time := (v_event.start_at AT TIME ZONE 'Europe/Madrid')::time;
  v_end_time := (v_event.end_at AT TIME ZONE 'Europe/Madrid')::time;
  
  -- Create the session
  INSERT INTO public.sessions (
    center_id,
    patient_id, 
    professional_id, 
    session_date, 
    start_time, 
    end_time,
    session_type, 
    price, 
    status, 
    session_modality, 
    location_id, 
    notes, 
    bono_id,
    google_calendar_event_id
  ) VALUES (
    v_center_id,
    p_patient_id, 
    v_event.professional_id, 
    v_session_date, 
    v_start_time, 
    v_end_time,
    p_session_type, 
    p_price, 
    'scheduled', 
    p_session_modality, 
    p_location_id, 
    COALESCE(p_notes, 'Convertido desde: ' || COALESCE(v_event.summary, 'Evento externo')),
    p_bono_id, 
    v_event.google_event_id
  ) RETURNING id INTO v_session_id;
  
  -- Mark the calendar event as converted
  UPDATE public.calendar_events SET
    is_converted = true,
    converted_session_id = v_session_id,
    converted_at = now()
  WHERE id = p_calendar_event_id;
  
  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;