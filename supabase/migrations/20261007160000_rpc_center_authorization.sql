-- Funciones SECURITY DEFINER que cualquiera (incluso anon) podía ejecutar sin
-- comprobar el centro del llamante. Comprobado en producción el 2026-10-07.
--
--   compute_patient_status(p_patient_id)        cambiaba el estado de cualquier paciente
--   convert_calendar_event_to_session(...)       creaba sesiones en cualquier centro
--   resolve_effective_price(...)                 devolvía precios y notas de cualquier paciente
--   resolve_applicable_price(...)                ídem; nadie la usa
--   get_center_for_debt(p_center_id)             datos fiscales y de cobro de cualquier centro; nadie la usa
--   get_center_for_invoice(p_center_id)          ídem; la usa /factura/:token (se sustituye por
--                                               get_center_for_invoice_token y se retira en
--                                               20261007160100 cuando la web nueva esté publicada)
--
-- assert_center_access(center) es la regla común: un usuario conectado tiene
-- que ser profesional o admin de ese centro; la service role (edge functions)
-- y los procesos internos sin JWT pasan; anon nunca.

CREATE OR REPLACE FUNCTION public.assert_center_access(p_center_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    -- Sin usuario: solo service role o procesos internos (crons, SQL directo).
    IF coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;

  IF p_center_id IS NULL
     OR p_center_id IS DISTINCT FROM public.get_user_center_id(auth.uid())
     OR NOT (public.is_admin(auth.uid()) OR public.is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_center_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_center_access(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- compute_patient_status: igual que antes, con la comprobación tras cargar
-- el paciente. La llaman usePatientStatus (usuario) y recompute-patient-statuses
-- (service role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_patient_status(p_patient_id uuid)
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

  PERFORM public.assert_center_access(v_patient.center_id);

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

REVOKE ALL ON FUNCTION public.compute_patient_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_patient_status(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- convert_calendar_event_to_session (versión de 9 argumentos, la que usa
-- useConvertCalendarEvent): el evento tiene que ser del centro del llamante y
-- todo lo que llega del cliente (paciente, bono, sala, tipo) del mismo centro.
-- La versión antigua de 8 argumentos no la usa nadie: queda solo para la
-- service role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.convert_calendar_event_to_session(p_calendar_event_id uuid, p_patient_id uuid, p_session_type text, p_price numeric, p_session_modality text DEFAULT 'in_person'::text, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_bono_id uuid DEFAULT NULL::uuid, p_session_type_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_session_id uuid;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_center_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.calendar_events
  WHERE id = p_calendar_event_id AND is_converted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento no encontrado o ya convertido';
  END IF;

  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_event.professional_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el centro del profesional';
  END IF;

  PERFORM public.assert_center_access(v_center_id);

  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND center_id = v_center_id) THEN
    RAISE EXCEPTION 'El paciente no pertenece al centro' USING ERRCODE = '42501';
  END IF;
  IF p_bono_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bonos WHERE id = p_bono_id AND center_id = v_center_id) THEN
    RAISE EXCEPTION 'El bono no pertenece al centro' USING ERRCODE = '42501';
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.center_locations WHERE id = p_location_id AND center_id = v_center_id) THEN
    RAISE EXCEPTION 'La sala no pertenece al centro' USING ERRCODE = '42501';
  END IF;
  IF p_session_type_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.session_types WHERE id = p_session_type_id AND center_id = v_center_id) THEN
    RAISE EXCEPTION 'El tipo de sesión no pertenece al centro' USING ERRCODE = '42501';
  END IF;

  v_session_date := DATE(v_event.start_at AT TIME ZONE 'Europe/Madrid');
  v_start_time := (v_event.start_at AT TIME ZONE 'Europe/Madrid')::time;
  v_end_time := (v_event.end_at AT TIME ZONE 'Europe/Madrid')::time;

  INSERT INTO public.sessions (
    center_id, patient_id, professional_id, session_date, start_time, end_time,
    session_type, session_type_id, price, status, session_modality, location_id, notes, bono_id,
    google_calendar_event_id
  ) VALUES (
    v_center_id, p_patient_id, v_event.professional_id, v_session_date, v_start_time, v_end_time,
    p_session_type, p_session_type_id, p_price, 'scheduled', p_session_modality, p_location_id,
    COALESCE(p_notes, 'Convertido desde: ' || COALESCE(v_event.summary, 'Evento externo')),
    p_bono_id, v_event.google_event_id
  ) RETURNING id INTO v_session_id;

  UPDATE public.calendar_events SET
    is_converted = true,
    converted_session_id = v_session_id,
    converted_at = now()
  WHERE id = p_calendar_event_id;

  RETURN v_session_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.convert_calendar_event_to_session(uuid, uuid, text, numeric, text, uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_calendar_event_to_session(uuid, uuid, text, numeric, text, uuid, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.convert_calendar_event_to_session(uuid, uuid, text, numeric, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.convert_calendar_event_to_session(uuid, uuid, text, numeric, text, uuid, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- resolve_effective_price: la usan la app (usuario), edge functions (service
-- role) y reprice_future_sessions (SQL, con el usuario que la llama). Se
-- comprueba el centro del paciente antes de devolver nada.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_effective_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
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
  PERFORM public.assert_center_access((SELECT center_id FROM public.patients WHERE id = p_patient_id));

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

REVOKE ALL ON FUNCTION public.resolve_effective_price(uuid, text, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_effective_price(uuid, text, uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Sin uso desde la app ni desde edge functions: solo service role.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.resolve_applicable_price(uuid, text, uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_applicable_price(uuid, text, uuid, date) TO service_role;

REVOKE ALL ON FUNCTION public.get_center_for_debt(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_center_for_debt(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- /factura/:token: datos del emisor a partir del token de la factura, no de
-- un center_id libre. Mismos campos que get_center_for_invoice.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_center_for_invoice_token(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'postal_code', c.postal_code,
    'province', c.province,
    'tax_id', c.tax_id,
    'phone', c.phone,
    'email', c.email,
    'invoice_logo_url', c.invoice_logo_url,
    'invoice_footer', c.invoice_footer,
    'invoice_data_protection_text', c.invoice_data_protection_text
  )
  FROM public.invoices i
  JOIN public.centers c ON c.id = i.center_id
  WHERE p_token IS NOT NULL
    AND length(trim(p_token)) > 0
    AND i.access_token = p_token
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.get_center_for_invoice_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_center_for_invoice_token(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Vistas: todas son security_invoker (respetan la RLS de la tabla base), pero
-- conservaban permisos de escritura para anon/authenticated que nadie usa.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON
  public.centers_public, public.oauth_connections_safe, public.patients_public,
  public.portal_centers, public.profiles_public, public.whatsapp_sessions_safe
  FROM PUBLIC, anon, authenticated;
