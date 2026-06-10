
-- Allow overlap bypass via per-transaction GUC, used by force-update RPC
CREATE OR REPLACE FUNCTION public.validate_no_session_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Allow user-confirmed overlap override
  IF current_setting('app.allow_session_overlap', true) = 'on' THEN
    RETURN NEW;
  END IF;

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
$function$;

-- RPC to update session date/time bypassing overlap check after user confirms
CREATE OR REPLACE FUNCTION public.update_session_datetime_force(
  p_session_id uuid,
  p_session_date date,
  p_start_time time,
  p_end_time time
)
RETURNS public.sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
  v_session public.sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_user_id;

  -- Verify session belongs to caller's center
  IF NOT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE id = p_session_id AND center_id = v_center_id
  ) THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  -- Caller must be admin or professional
  IF NOT (public.is_admin() OR public.is_professional()) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  PERFORM set_config('app.allow_session_overlap', 'on', true);

  UPDATE public.sessions
  SET session_date = p_session_date,
      start_time = p_start_time,
      end_time = p_end_time,
      updated_at = now()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_session_datetime_force(uuid, date, time, time) TO authenticated;
