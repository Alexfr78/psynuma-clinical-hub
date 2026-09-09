-- Drop and recreate the apply_bono_to_session function to also:
-- 1. Set session price to 0
-- 2. Delete or mark as paid any existing session debt

CREATE OR REPLACE FUNCTION public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bono record;
  v_inserted boolean := false;
  v_debt_deleted boolean := false;
BEGIN
  -- Lock bono row to avoid race conditions
  SELECT * INTO v_bono
  FROM public.bonos
  WHERE id = p_bono_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no existe';
  END IF;

  IF v_bono.status IS NOT NULL AND v_bono.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Bono no está activo';
  END IF;

  IF COALESCE(v_bono.used_sessions, 0) >= COALESCE(v_bono.total_sessions, 0) THEN
    RAISE EXCEPTION 'Bono sin sesiones disponibles';
  END IF;

  -- Ensure session exists
  PERFORM 1 FROM public.sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sesión no existe';
  END IF;

  -- Insert consumption if not exists
  BEGIN
    INSERT INTO public.bono_items (bono_id, session_id, created_at)
    VALUES (p_bono_id, p_session_id, now());
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false; -- already consumed
  END;

  -- Link bono to session AND set price to 0 (covered by bono)
  UPDATE public.sessions
  SET bono_id = p_bono_id,
      price = 0,
      payment_status = 'paid',
      updated_at = now()
  WHERE id = p_session_id;

  -- Delete or update the existing debt for this session
  -- If debt has no payments (paid_amount = 0), delete it
  -- If debt has partial payments, update amount to 0 and mark as paid
  DELETE FROM public.debts
  WHERE session_id = p_session_id
    AND (paid_amount IS NULL OR paid_amount = 0)
    AND invoice_id IS NULL;
  
  IF FOUND THEN
    v_debt_deleted := true;
  ELSE
    -- If there's a debt with an invoice or with payments, mark as paid with amount = 0
    UPDATE public.debts
    SET amount = 0,
        status = 'paid',
        notes = COALESCE(notes, '') || ' (Cubierto por bono)',
        updated_at = now()
    WHERE session_id = p_session_id
      AND status != 'paid';
  END IF;

  -- Also update any billable_events for this session
  UPDATE public.billable_events
  SET amount = 0,
      billing_status = 'paid',
      updated_at = now()
  WHERE session_id = p_session_id;

  -- Only increment used_sessions if a new bono_item was created
  IF v_inserted THEN
    UPDATE public.bonos
    SET used_sessions = COALESCE(used_sessions, 0) + 1,
        updated_at = now()
    WHERE id = p_bono_id;

    -- If exhausted, mark status
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
    'debt_deleted', v_debt_deleted
  );
END;
$$;