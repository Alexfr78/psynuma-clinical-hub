-- Crea public.apply_bono_to_session_service, que faltaba.
--
-- El webhook de Stripe (supabase/functions/stripe-webhook) la llama por RPC al
-- cobrar un bono comprado desde el enlace de la cita. La variante original,
-- apply_bono_to_session, exige auth.uid() con rol profesional o admin, y el
-- webhook corre con service_role sin usuario, así que fallaba siempre y la
-- sesión se quedaba enlazada al bono con la deuda abierta.
--
-- La migración 20260909130000 (hoy archivada) daba por hecho que esta función
-- existía y solo ejecutaba el backfill, de modo que nunca llegó a crearse.

CREATE OR REPLACE FUNCTION public.apply_bono_to_session_service(p_bono_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bono record;
  v_session_center_id uuid;
  v_already_linked boolean := false;
  v_inserted boolean := false;
  v_debt_deleted boolean := false;
BEGIN
  -- Sin auth.uid() no se puede comprobar el centro del usuario, así que el
  -- aislamiento entre centros se apoya en que la sesión y el bono sean del
  -- mismo centro. Esta función NO debe quedar al alcance de anon ni de
  -- authenticated: los permisos del final la reservan a service_role.
  SELECT * INTO v_bono FROM public.bonos WHERE id = p_bono_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono % no existe', p_bono_id;
  END IF;

  SELECT center_id INTO v_session_center_id FROM public.sessions WHERE id = p_session_id;
  IF v_session_center_id IS NULL THEN
    RAISE EXCEPTION 'Sesión % no existe', p_session_id;
  END IF;
  IF v_session_center_id IS DISTINCT FROM v_bono.center_id THEN
    RAISE EXCEPTION 'La sesión % y el bono % pertenecen a centros distintos', p_session_id, p_bono_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.bono_items
    WHERE bono_id = p_bono_id AND session_id = p_session_id
  ) INTO v_already_linked;

  -- Idempotente: si la sesión ya estaba enlazada no se vuelve a consumir cupo,
  -- y no se exige que queden sesiones libres. Hace falta para el backfill, que
  -- reaplica enlaces que el fallback del webhook dejó a medias sobre bonos que
  -- entretanto ya figuran agotados.
  IF NOT v_already_linked THEN
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
  END IF;

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

  -- billing_status solo admite 'pending' o 'settled'.
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

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'already_linked', v_already_linked,
    'debt_deleted', v_debt_deleted
  );
END;
$function$;

-- Reservada al webhook. Es SECURITY DEFINER y no comprueba el usuario, así que
-- dejarla abierta permitiría a cualquier autenticado aplicar bonos ajenos.
REVOKE ALL ON FUNCTION public.apply_bono_to_session_service(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bono_to_session_service(uuid, uuid) TO service_role;

-- Backfill: sesiones que el fallback del webhook dejó a medias, enlazadas al
-- bono con payment_status 'bono' y su deuda todavía abierta.
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS session_id, s.bono_id
    FROM public.sessions s
    JOIN public.bono_items bi ON bi.session_id = s.id AND bi.bono_id = s.bono_id
    WHERE s.bono_id IS NOT NULL
      AND s.payment_status = 'bono'
  LOOP
    PERFORM public.apply_bono_to_session_service(r.bono_id, r.session_id);
  END LOOP;

  -- El fallback fijaba used_sessions = 1 sin mirar el contador previo.
  UPDATE public.bonos b
  SET used_sessions = sub.cnt,
      status = CASE
        WHEN sub.cnt >= COALESCE(b.total_sessions, 0) THEN 'exhausted'
        WHEN b.status = 'exhausted' THEN 'active'
        ELSE b.status
      END,
      updated_at = now()
  FROM (
    SELECT bono_id, COUNT(*)::int AS cnt
    FROM public.bono_items
    GROUP BY bono_id
  ) sub
  WHERE b.id = sub.bono_id
    AND b.stripe_checkout_session_id IS NOT NULL
    AND COALESCE(b.used_sessions, 0) <> sub.cnt;
END;
$backfill$;