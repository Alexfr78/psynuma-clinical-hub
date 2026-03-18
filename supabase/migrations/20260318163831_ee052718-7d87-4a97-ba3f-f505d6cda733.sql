
-- Create a validation trigger to prevent overlapping sessions for the same professional
CREATE OR REPLACE FUNCTION public.validate_no_session_overlap()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only check non-cancelled sessions
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Check for overlapping sessions
  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.professional_id = NEW.professional_id
      AND s.session_date = NEW.session_date
      AND s.id != NEW.id
      AND s.status != 'cancelled'
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'La sesión se solapa con otra cita existente del profesional'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_validate_no_session_overlap ON public.sessions;
CREATE TRIGGER trg_validate_no_session_overlap
  BEFORE INSERT OR UPDATE OF session_date, start_time, end_time, status, professional_id
  ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_no_session_overlap();
