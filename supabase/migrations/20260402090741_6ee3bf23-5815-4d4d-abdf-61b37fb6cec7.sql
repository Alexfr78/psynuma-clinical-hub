CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_user_id uuid,
  p_user_role text,
  p_organization_id uuid,
  p_patient_id uuid,
  p_resource_type text,
  p_resource_id text,
  p_action text,
  p_status text DEFAULT 'success',
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_request_method text DEFAULT NULL,
  p_route_or_endpoint text DEFAULT NULL,
  p_justification text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_previous_hash text;
  v_previous_seq bigint;
  v_payload text;
  v_current_hash text;
  v_new_id uuid;
  v_is_anomalous boolean := false;
  v_anomaly_reason text := NULL;
  v_now timestamptz := now();
BEGIN
  SELECT current_hash, seq
  INTO v_previous_hash, v_previous_seq
  FROM public.audit_logs
  ORDER BY seq DESC
  LIMIT 1;

  v_payload := concat_ws('|',
    coalesce(p_user_id::text, 'null'),
    coalesce(p_user_role, 'null'),
    coalesce(p_organization_id::text, 'null'),
    coalesce(p_patient_id::text, 'null'),
    p_resource_type,
    coalesce(p_resource_id, 'null'),
    p_action,
    p_status,
    v_now::text,
    coalesce(v_previous_hash, 'GENESIS')
  );

  v_current_hash := encode(
    extensions.digest(v_payload::bytea, 'sha256'),
    'hex'
  );

  IF p_status = 'denied' THEN
    v_is_anomalous := true;
    v_anomaly_reason := 'ACCESS_DENIED';
  END IF;

  IF EXTRACT(HOUR FROM v_now AT TIME ZONE 'Europe/Madrid') < 7
     OR EXTRACT(HOUR FROM v_now AT TIME ZONE 'Europe/Madrid') >= 22 THEN
    v_is_anomalous := true;
    v_anomaly_reason := coalesce(v_anomaly_reason || ', ', '') || 'OUT_OF_HOURS';
  END IF;

  IF p_patient_id IS NOT NULL AND p_user_id IS NOT NULL THEN
    IF (
      SELECT COUNT(DISTINCT patient_id)
      FROM public.audit_logs
      WHERE user_id = p_user_id
        AND created_at > v_now - interval '5 minutes'
        AND patient_id IS NOT NULL
    ) >= 20 THEN
      v_is_anomalous := true;
      v_anomaly_reason := coalesce(v_anomaly_reason || ', ', '') || 'MASS_ACCESS';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, user_role, organization_id, patient_id,
    resource_type, resource_id, action, status,
    ip_address, user_agent, session_id,
    request_method, route_or_endpoint, justification,
    metadata, previous_hash, current_hash,
    is_anomalous, anomaly_reason, created_at
  ) VALUES (
    p_user_id, p_user_role, p_organization_id, p_patient_id,
    p_resource_type, p_resource_id, p_action, p_status,
    p_ip_address, p_user_agent, p_session_id,
    p_request_method, p_route_or_endpoint, p_justification,
    p_metadata, v_previous_hash, v_current_hash,
    v_is_anomalous, v_anomaly_reason, v_now
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;