CREATE OR REPLACE FUNCTION public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono record;
  v_session_center_id uuid;
  v_inserted boolean := false;
  v_debt_deleted boolean := false;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT * INTO v_bono FROM public.bonos
  WHERE id = p_bono_id AND center_id = v_user_center_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no existe o no pertenece a tu centro';
  END IF;

  SELECT center_id INTO v_session_center_id FROM public.sessions WHERE id = p_session_id;
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono.status IS NOT NULL AND v_bono.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Bono no está activo';
  END IF;

  IF COALESCE(v_bono.used_sessions, 0) >= COALESCE(v_bono.total_sessions, 0) THEN
    RAISE EXCEPTION 'Bono sin sesiones disponibles';
  END IF;

  BEGIN
    INSERT INTO public.bono_items (bono_id, session_id, created_at)
    VALUES (p_bono_id, p_session_id, now());
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  UPDATE public.sessions
  SET bono_id = p_bono_id, price = 0, payment_status = 'paid', updated_at = now()
  WHERE id = p_session_id;

  DELETE FROM public.debts
  WHERE session_id = p_session_id
    AND (paid_amount IS NULL OR paid_amount = 0)
    AND invoice_id IS NULL;
  IF FOUND THEN
    v_debt_deleted := true;
  ELSE
    UPDATE public.debts
    SET amount = 0, status = 'paid',
        notes = COALESCE(notes, '') || ' (Cubierto por bono)', updated_at = now()
    WHERE session_id = p_session_id AND status != 'paid';
  END IF;

  -- FIX: billing_status check constraint only allows 'pending' or 'settled'
  UPDATE public.billable_events
  SET amount = 0, billing_status = 'settled', updated_at = now()
  WHERE session_id = p_session_id;

  IF v_inserted THEN
    UPDATE public.bonos
    SET used_sessions = COALESCE(used_sessions, 0) + 1, updated_at = now()
    WHERE id = p_bono_id;

    UPDATE public.bonos
    SET status = CASE
      WHEN COALESCE(used_sessions, 0) >= COALESCE(total_sessions, 0) THEN 'exhausted'
      ELSE status
    END
    WHERE id = p_bono_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'debt_deleted', v_debt_deleted);
END;
$function$;