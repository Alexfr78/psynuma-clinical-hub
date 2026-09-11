-- La aplicación manual necesita la misma automatización que el webhook, pero
-- con la variante autenticada para conservar las comprobaciones de centro y rol.
-- Es el mismo patrón dual que existe entre apply_bono_to_session y su variante service.

CREATE OR REPLACE FUNCTION public.auto_apply_bono_to_pending_sessions(p_bono_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono record;
  v_candidate record;
  v_remaining integer;
  v_applied_session_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT * INTO v_bono
  FROM public.bonos
  WHERE id = p_bono_id
    AND center_id = v_user_center_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no existe o no pertenece a tu centro';
  END IF;

  IF v_bono.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Bono no está activo';
  END IF;

  v_remaining := GREATEST(
    0,
    COALESCE(v_bono.total_sessions, 0) - COALESCE(v_bono.used_sessions, 0)
  );

  FOR v_candidate IN
    SELECT s.id AS session_id
    FROM public.sessions s
    JOIN public.debts d ON d.session_id = s.id
    WHERE s.patient_id = v_bono.patient_id
      AND s.center_id = v_bono.center_id
      AND s.bono_id IS NULL
      AND d.session_id IS NOT NULL
      AND d.bono_id IS NULL
      AND d.invoice_id IS NULL
      AND COALESCE(d.paid_amount, 0) = 0
      AND d.status = 'pending'
    GROUP BY s.id, s.session_date, s.start_time
    ORDER BY s.session_date ASC, s.start_time ASC
  LOOP
    EXIT WHEN v_remaining <= 0;

    BEGIN
      PERFORM public.apply_bono_to_session(p_bono_id, v_candidate.session_id);
      v_applied_session_ids := array_append(v_applied_session_ids, v_candidate.session_id);
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM = 'Bono no está activo' OR SQLERRM LIKE 'Bono % no existe' THEN
        RAISE;
      END IF;
      RAISE NOTICE 'No se pudo aplicar el bono % a la sesión %: %',
        p_bono_id, v_candidate.session_id, SQLERRM;
    END;

    SELECT GREATEST(
      0,
      COALESCE(total_sessions, 0) - COALESCE(used_sessions, 0)
    )
    INTO v_remaining
    FROM public.bonos
    WHERE id = p_bono_id;
  END LOOP;

  SELECT GREATEST(
    0,
    COALESCE(total_sessions, 0) - COALESCE(used_sessions, 0)
  )
  INTO v_remaining
  FROM public.bonos
  WHERE id = p_bono_id;

  RETURN jsonb_build_object(
    'applied_session_ids', to_jsonb(v_applied_session_ids),
    'remaining_sessions', v_remaining
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_apply_bono_to_pending_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_apply_bono_to_pending_sessions(uuid) TO authenticated;
