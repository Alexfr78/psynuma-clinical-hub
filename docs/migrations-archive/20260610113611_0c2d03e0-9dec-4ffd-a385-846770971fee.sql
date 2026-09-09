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

  SELECT center_id INTO v_center_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'User center not found';
  END IF;

  IF NOT (public.is_admin(v_user_id) OR public.is_professional(v_user_id)) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions
    WHERE id = p_session_id
      AND center_id = v_center_id
  ) THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  PERFORM set_config('app.allow_session_overlap', 'on', true);

  UPDATE public.sessions
  SET session_date = p_session_date,
      start_time = p_start_time,
      end_time = p_end_time,
      updated_at = now()
  WHERE id = p_session_id
    AND center_id = v_center_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_session_datetime_force(uuid, date, time, time) TO authenticated;