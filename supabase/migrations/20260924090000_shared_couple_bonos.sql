-- Bonos compartidos entre los dos miembros de una pareja.
--
-- `bonos.patient_id` sigue siendo el COMPRADOR (a su nombre va la deuda y la
-- factura). `shared_with_patient_id` es el otro miembro: el bono se gasta, a
-- 1 unidad por sesión, en cualquier sesión cuyo titular sea uno de los dos,
-- individual o de pareja.
--
-- Solo se puede compartir con quien esté vinculado como pareja en ese momento
-- (el vínculo lo crea el profesional desde la ficha). Si después se desvinculan,
-- el bono ya comprado sigue compartido: no se le quita a nadie algo pagado.

ALTER TABLE public.bonos
  ADD COLUMN IF NOT EXISTS shared_with_patient_id uuid
    CONSTRAINT bonos_shared_with_patient_id_fkey REFERENCES public.patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bonos_shared_with_patient_idx
  ON public.bonos (shared_with_patient_id)
  WHERE shared_with_patient_id IS NOT NULL;

COMMENT ON COLUMN public.bonos.shared_with_patient_id IS
  'Pareja con la que se comparte el bono. El comprador es patient_id.';

CREATE OR REPLACE FUNCTION public.validate_bono_sharing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.shared_with_patient_id IS NULL
     OR (TG_OP = 'UPDATE' AND NEW.shared_with_patient_id IS NOT DISTINCT FROM OLD.shared_with_patient_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.shared_with_patient_id = NEW.patient_id THEN
    RAISE EXCEPTION 'Un bono no se comparte con su propio comprador';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patient_relationships r
    WHERE r.relationship_type = 'couple'
      AND r.center_id = NEW.center_id
      AND r.patient_a_id = LEAST(NEW.patient_id, NEW.shared_with_patient_id)
      AND r.patient_b_id = GREATEST(NEW.patient_id, NEW.shared_with_patient_id)
  ) THEN
    RAISE EXCEPTION 'Solo se puede compartir el bono con la pareja vinculada en la ficha';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_bono_sharing ON public.bonos;
CREATE TRIGGER validate_bono_sharing
  BEFORE INSERT OR UPDATE OF shared_with_patient_id ON public.bonos
  FOR EACH ROW EXECUTE FUNCTION public.validate_bono_sharing();

REVOKE ALL ON FUNCTION public.validate_bono_sharing() FROM PUBLIC, anon, authenticated;

-- Nombre de pila de la pareja vinculada, para ofrecer "Compartir con X" en las
-- páginas públicas de pago (/cita/:token y /pagar/:token). Solo devuelve algo a
-- quien tiene el enlace del propio titular.
CREATE OR REPLACE FUNCTION public.get_public_couple_partner_first_name(
  p_session_token text DEFAULT NULL,
  p_debt_token text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_patient_id uuid;
  v_partner_first_name text;
BEGIN
  IF p_session_token IS NOT NULL THEN
    SELECT patient_id INTO v_patient_id FROM public.sessions WHERE access_token = p_session_token;
  ELSIF p_debt_token IS NOT NULL THEN
    SELECT patient_id INTO v_patient_id FROM public.debts WHERE access_token = p_debt_token;
  END IF;

  IF v_patient_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.first_name INTO v_partner_first_name
  FROM public.patient_relationships r
  JOIN public.patients p
    ON p.id = CASE WHEN r.patient_a_id = v_patient_id THEN r.patient_b_id ELSE r.patient_a_id END
  WHERE r.relationship_type = 'couple'
    AND v_patient_id IN (r.patient_a_id, r.patient_b_id)
  LIMIT 1;

  RETURN v_partner_first_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_couple_partner_first_name(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_couple_partner_first_name(text, text) TO anon, authenticated, service_role;

-- ─── Aplicación automática a sesiones pendientes: también las de la pareja ──
-- Mismo cuerpo que 20260911114952 / 20260911121011; solo cambia el filtro de
-- sesiones candidatas (titular = comprador o pareja con la que se comparte).

CREATE OR REPLACE FUNCTION public.auto_apply_bono_to_pending_sessions_service(p_bono_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bono record;
  v_candidate record;
  v_remaining integer;
  v_applied_session_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_bono
  FROM public.bonos
  WHERE id = p_bono_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono % no existe', p_bono_id;
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
    WHERE s.patient_id IN (v_bono.patient_id, v_bono.shared_with_patient_id)
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
      PERFORM public.apply_bono_to_session_service(p_bono_id, v_candidate.session_id);
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

REVOKE ALL ON FUNCTION public.auto_apply_bono_to_pending_sessions_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_apply_bono_to_pending_sessions_service(uuid) TO service_role;

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
    WHERE s.patient_id IN (v_bono.patient_id, v_bono.shared_with_patient_id)
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
