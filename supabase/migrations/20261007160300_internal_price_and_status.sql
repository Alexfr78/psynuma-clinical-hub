-- Arreglo de 20261007160000_rpc_center_authorization.sql.
--
-- assert_center_access dentro de resolve_effective_price y
-- compute_patient_status rompía a quien ya había autorizado la fila por otro
-- camino y llama como anon o como paciente:
--   - get_public_bono_templates_for_session / _for_debt (/cita y /pagar por
--     token): la oferta de bonos dejaba de aparecer sin aviso;
--   - los triggers apply_resolved_price_to_session y
--     trigger_update_patient_status_on_session_change, que abortaban
--     cualquier escritura en sessions hecha por un llamante sin centro.
--
-- Ahora la lógica vive en _resolve_effective_price_internal y
-- _compute_patient_status_internal (solo service_role; las funciones SECURITY
-- DEFINER las ejecutan como propietario). Las RPC públicas hacen
-- assert_center_access y delegan; las funciones por token y los triggers
-- llaman directamente a la interna.

-- ---------------------------------------------------------------------------
-- Precio efectivo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._resolve_effective_price_internal(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_price NUMERIC(10,2);
  v_custom RECORD;
  v_assignment RECORD;
  v_tariff_price NUMERIC(10,2);
  v_plan_name TEXT;
BEGIN
  IF p_target_type = 'session_type' THEN
    SELECT default_price INTO v_base_price FROM session_types
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  ELSIF p_target_type = 'bono_template' THEN
    SELECT total_price INTO v_base_price FROM bono_templates
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  END IF;

  SELECT * INTO v_custom FROM patient_custom_prices
  WHERE patient_id = p_patient_id AND target_type = p_target_type
    AND target_id = p_target_id AND is_active = true
    AND start_date <= p_reference_date
    AND (end_date IS NULL OR end_date >= p_reference_date)
  ORDER BY start_date DESC LIMIT 1;

  IF v_custom.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'base_price', v_base_price, 'applied_price', v_custom.custom_price,
      'pricing_source', 'custom', 'tariff_plan_id', NULL, 'tariff_plan_name', NULL,
      'tariff_plan_assignment_id', NULL, 'custom_price_id', v_custom.id,
      'is_temporary', v_custom.end_date IS NOT NULL,
      'valid_from', v_custom.start_date, 'valid_to', v_custom.end_date,
      'note', v_custom.notes
    );
  END IF;

  SELECT a.* INTO v_assignment FROM patient_tariff_plan_assignments a
  WHERE a.patient_id = p_patient_id AND a.is_active = true
    AND a.start_date <= p_reference_date
    AND (a.end_date IS NULL OR a.end_date >= p_reference_date)
  ORDER BY a.start_date DESC LIMIT 1;

  IF v_assignment.id IS NOT NULL THEN
    SELECT tpi.price, tp.name INTO v_tariff_price, v_plan_name
    FROM tariff_plan_items tpi JOIN tariff_plans tp ON tp.id = tpi.tariff_plan_id
    WHERE tpi.tariff_plan_id = v_assignment.tariff_plan_id
      AND tpi.target_type = p_target_type AND tpi.target_id = p_target_id
      AND tp.is_active = true;
    IF v_tariff_price IS NOT NULL THEN
      RETURN jsonb_build_object(
        'base_price', v_base_price, 'applied_price', v_tariff_price,
        'pricing_source', 'tariff_plan', 'tariff_plan_id', v_assignment.tariff_plan_id,
        'tariff_plan_name', v_plan_name, 'tariff_plan_assignment_id', v_assignment.id,
        'custom_price_id', NULL, 'is_temporary', v_assignment.end_date IS NOT NULL,
        'valid_from', v_assignment.start_date, 'valid_to', v_assignment.end_date,
        'note', v_assignment.notes
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'base_price', v_base_price, 'applied_price', v_base_price,
    'pricing_source', 'base', 'tariff_plan_id', NULL, 'tariff_plan_name', NULL,
    'tariff_plan_assignment_id', NULL, 'custom_price_id', NULL,
    'is_temporary', false, 'valid_from', NULL, 'valid_to', NULL, 'note', NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._resolve_effective_price_internal(uuid, text, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._resolve_effective_price_internal(uuid, text, uuid, date) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_effective_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_center_access((SELECT center_id FROM public.patients WHERE id = p_patient_id));
  RETURN public._resolve_effective_price_internal(p_patient_id, p_target_type, p_target_id, p_reference_date);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Estado del paciente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._compute_patient_status_internal(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient RECORD;
  v_has_future_session boolean;
  v_last_completed_session timestamptz;
  v_new_status patient_status;
  v_reason text;
BEGIN
  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Patient not found');
  END IF;

  -- Si está marcado manualmente como 'discharged', no cambiar
  IF v_patient.status = 'discharged' AND v_patient.status_source = 'manual' THEN
    RETURN jsonb_build_object(
      'status', 'discharged',
      'source', 'manual',
      'reason', 'manual_discharge',
      'changed', false
    );
  END IF;

  -- Verificar si tiene cita futura vigente (no cancelada, no no_show)
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE patient_id = p_patient_id
    AND (
      (session_date > CURRENT_DATE)
      OR (session_date = CURRENT_DATE AND start_time > CURRENT_TIME)
    )
    AND status IN ('scheduled', 'confirmed', 'pending_approval', 'reschedule_requested')
  ) INTO v_has_future_session;

  IF v_has_future_session THEN
    v_new_status := 'active';
    v_reason := 'future_appointment';
  ELSE
    SELECT MAX(
      (session_date || ' ' || start_time)::timestamptz
    ) INTO v_last_completed_session
    FROM public.sessions
    WHERE patient_id = p_patient_id
    AND status = 'completed';

    IF v_last_completed_session IS NOT NULL AND
       v_last_completed_session >= (NOW() - INTERVAL '30 days') THEN
      v_new_status := 'active';
      v_reason := 'last_session_within_30d';
    ELSE
      v_new_status := 'inactive';
      v_reason := 'inactive_no_activity';
    END IF;
  END IF;

  IF v_patient.status != v_new_status OR v_patient.status_source != 'auto' THEN
    UPDATE public.patients
    SET
      status = v_new_status,
      status_source = 'auto',
      status_reason = v_reason,
      status_updated_at = NOW(),
      updated_at = NOW()
    WHERE id = p_patient_id
    AND (status_source = 'auto' OR status != 'discharged'); -- No sobrescribir discharge manual

    RETURN jsonb_build_object(
      'status', v_new_status,
      'source', 'auto',
      'reason', v_reason,
      'changed', true,
      'previous_status', v_patient.status
    );
  END IF;

  RETURN jsonb_build_object(
    'status', v_new_status,
    'source', 'auto',
    'reason', v_reason,
    'changed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._compute_patient_status_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compute_patient_status_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.compute_patient_status(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
BEGIN
  SELECT center_id INTO v_center_id FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Patient not found');
  END IF;
  PERFORM public.assert_center_access(v_center_id);
  RETURN public._compute_patient_status_internal(p_patient_id);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Llamantes que ya autorizan por su cuenta: usan la interna.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_debt(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.debts d
  JOIN public.bono_templates bt
    ON bt.center_id = d.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public._resolve_effective_price_internal(d.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE d.access_token = p_token
    AND d.status IN ('pending', 'partial');

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_session(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.sessions s
  JOIN public.bono_templates bt
    ON bt.center_id = s.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public._resolve_effective_price_internal(s.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE s.access_token = p_token
    AND s.status <> 'cancelled'
    AND COALESCE(s.payment_status, '') NOT IN ('paid', 'bono')
    AND s.stripe_payment_status IS DISTINCT FROM 'paid';

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_resolved_price_to_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NEW.session_type_id IS NULL OR NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.pricing_source,'') NOT IN ('custom','tariff_plan') THEN
    SELECT public._resolve_effective_price_internal(
      NEW.patient_id, 'session_type', NEW.session_type_id, NEW.session_date::date
    ) INTO r;
    IF r IS NOT NULL THEN
      NEW.base_price_snapshot := COALESCE(NEW.base_price_snapshot, NULLIF(r->>'base_price','')::numeric);
      NEW.pricing_source      := COALESCE(NULLIF(r->>'pricing_source',''), 'base');
      IF (r->>'pricing_source') IN ('custom','tariff_plan') THEN
        NEW.price                              := (r->>'applied_price')::numeric;
        NEW.custom_price_id                    := NULLIF(r->>'custom_price_id','')::uuid;
        NEW.tariff_plan_id_snapshot            := NULLIF(r->>'tariff_plan_id','')::uuid;
        NEW.tariff_plan_assignment_id_snapshot := NULLIF(r->>'tariff_plan_assignment_id','')::uuid;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_update_patient_status_on_session_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id uuid;
BEGIN
  -- Determinar el patient_id afectado
  IF TG_OP = 'DELETE' THEN
    v_patient_id := OLD.patient_id;
  ELSE
    v_patient_id := NEW.patient_id;
  END IF;

  -- Si el paciente está en ALTA manual, no recalcular
  IF EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = v_patient_id
    AND status = 'discharged'
    AND status_source = 'manual'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Recalcular estado del paciente (la fila ya pasó la RLS de sessions)
  PERFORM public._compute_patient_status_internal(v_patient_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;
