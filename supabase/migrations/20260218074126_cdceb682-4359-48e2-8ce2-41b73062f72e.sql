
CREATE OR REPLACE FUNCTION public.remove_bono_from_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_session_center_id uuid;
  v_bono_id uuid;
  v_deleted boolean := false;
  v_default_price numeric;
  v_session_type text;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- SECURITY CHECK: Verify session belongs to caller's center
  SELECT center_id, bono_id, session_type INTO v_session_center_id, v_bono_id, v_session_type
  FROM public.sessions
  WHERE id = p_session_id;
  
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', false, 'reason', 'no_bono_linked');
  END IF;

  -- Delete consumption row if exists
  DELETE FROM public.bono_items
  WHERE session_id = p_session_id AND bono_id = v_bono_id
  RETURNING true INTO v_deleted;

  -- Lookup default price from session_types (case-insensitive)
  SELECT default_price INTO v_default_price
  FROM public.session_types
  WHERE center_id = v_session_center_id
    AND LOWER(name) = LOWER(v_session_type)
  LIMIT 1;

  -- Unlink session and restore price
  UPDATE public.sessions
  SET bono_id = NULL,
      price = COALESCE(v_default_price, price),
      payment_status = CASE WHEN v_default_price IS NOT NULL AND v_default_price > 0 THEN 'pending' ELSE payment_status END,
      updated_at = now()
  WHERE id = p_session_id;

  -- Decrement only if we actually deleted a consumption row
  IF v_deleted THEN
    UPDATE public.bonos
    SET used_sessions = GREATEST(COALESCE(used_sessions, 0) - 1, 0),
        status = 'active',
        updated_at = now()
    WHERE id = v_bono_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'restored_price', COALESCE(v_default_price, 0));
END;
$function$;
