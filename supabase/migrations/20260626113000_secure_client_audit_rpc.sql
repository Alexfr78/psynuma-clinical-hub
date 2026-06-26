-- Narrow browser-originated audit writes so client code cannot choose identity,
-- center, role, status, or other trusted audit fields.

CREATE OR REPLACE FUNCTION public.record_client_audit_event(
  p_resource_type text,
  p_resource_id text DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_action text DEFAULT 'VIEW',
  p_route_or_endpoint text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
  v_user_role text;
  v_patient_center_id uuid;
  v_allowed_resource_types text[] := ARRAY[
    'patients',
    'sessions',
    'assessments',
    'consents',
    'invoices',
    'invoice_items',
    'autoregistro_entries',
    'autoregistro_templates',
    'documents',
    'reports',
    'clinical_notes',
    'app_change_log',
    'app_versions',
    'verifactu_records'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF p_action <> 'VIEW' THEN
    RAISE EXCEPTION 'Accion de auditoria cliente no permitida';
  END IF;

  IF p_resource_type IS NULL OR NOT (p_resource_type = ANY(v_allowed_resource_types)) THEN
    RAISE EXCEPTION 'Tipo de recurso de auditoria no permitido';
  END IF;

  SELECT p.center_id
  INTO v_center_id
  FROM public.profiles p
  WHERE p.id = v_user_id
    AND COALESCE(p.is_active, true) = true;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'Usuario sin centro activo';
  END IF;

  IF p_patient_id IS NOT NULL THEN
    SELECT patient.center_id
    INTO v_patient_center_id
    FROM public.patients patient
    WHERE patient.id = p_patient_id;

    IF v_patient_center_id IS NULL OR v_patient_center_id <> v_center_id THEN
      RAISE EXCEPTION 'Paciente fuera del centro del usuario';
    END IF;
  END IF;

  SELECT string_agg(ur.role::text, ',' ORDER BY ur.role::text)
  INTO v_user_role
  FROM public.user_roles ur
  WHERE ur.user_id = v_user_id
    AND (
      ur.center_id = v_center_id
      OR ur.center_id IS NULL
    );

  RETURN public.record_audit_event(
    p_user_id := v_user_id,
    p_user_role := v_user_role,
    p_organization_id := v_center_id,
    p_patient_id := p_patient_id,
    p_resource_type := p_resource_type,
    p_resource_id := p_resource_id,
    p_action := p_action,
    p_status := 'success',
    p_ip_address := NULL,
    p_user_agent := p_user_agent,
    p_session_id := NULL,
    p_request_method := 'GET',
    p_route_or_endpoint := p_route_or_endpoint,
    p_justification := NULL,
    p_metadata := COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_audit_event(
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_client_audit_event(
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb
) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.record_audit_event(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb
) FROM authenticated;

COMMENT ON FUNCTION public.record_client_audit_event(
  text,
  text,
  uuid,
  text,
  text,
  text,
  jsonb
) IS
  'Safe client-facing audit RPC. Derives user, role, center and status server-side, then delegates to record_audit_event.';
