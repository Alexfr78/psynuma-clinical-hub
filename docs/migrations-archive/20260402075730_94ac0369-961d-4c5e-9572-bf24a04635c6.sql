-- Enable pgcrypto if not already (needed for digest)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Create the audit_logs table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_role text NULL,
  organization_id uuid NULL REFERENCES public.centers(id) ON DELETE SET NULL,
  patient_id uuid NULL REFERENCES public.patients(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id text NULL,
  action text NOT NULL,
  justification text NULL,
  ip_address text NULL,
  user_agent text NULL,
  session_id text NULL,
  request_method text NULL,
  route_or_endpoint text NULL,
  status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'denied', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}',
  previous_hash text NULL,
  current_hash text NOT NULL,
  is_anomalous boolean NOT NULL DEFAULT false,
  anomaly_reason text NULL
);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);
CREATE INDEX audit_logs_user_id_idx ON public.audit_logs(user_id);
CREATE INDEX audit_logs_patient_id_idx ON public.audit_logs(patient_id);
CREATE INDEX audit_logs_action_idx ON public.audit_logs(action);
CREATE INDEX audit_logs_resource_type_idx ON public.audit_logs(resource_type);
CREATE INDEX audit_logs_organization_id_idx ON public.audit_logs(organization_id);
CREATE INDEX audit_logs_is_anomalous_idx ON public.audit_logs(is_anomalous)
  WHERE is_anomalous = true;

-- RLS: fully locked - no direct access
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct read"
  ON public.audit_logs FOR SELECT USING (false);

CREATE POLICY "No direct insert"
  ON public.audit_logs FOR INSERT WITH CHECK (false);

CREATE POLICY "No direct update"
  ON public.audit_logs FOR UPDATE USING (false);

CREATE POLICY "No direct delete"
  ON public.audit_logs FOR DELETE USING (false);

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Core audit function (SECURITY DEFINER bypasses RLS)
-- ═══════════════════════════════════════════════════════════════

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
  -- Get the hash of the last event for chain integrity
  SELECT current_hash, seq
  INTO v_previous_hash, v_previous_seq
  FROM public.audit_logs
  ORDER BY seq DESC
  LIMIT 1;

  -- Build deterministic payload string for hashing
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

  -- SHA-256 hash using pgcrypto
  v_current_hash := encode(
    digest(v_payload, 'sha256'),
    'hex'
  );

  -- Anomaly detection rules
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

REVOKE ALL ON FUNCTION public.record_audit_event FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_audit_event TO service_role;
GRANT EXECUTE ON FUNCTION public.record_audit_event TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: Generic trigger function for clinical tables
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.audit_clinical_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_resource_id text;
  v_patient_id uuid;
  v_metadata jsonb;
  v_user_id uuid;
  v_org_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_resource_id := NEW.id::text;
    v_metadata := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_resource_id := NEW.id::text;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_resource_id := OLD.id::text;
    v_metadata := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_patient_id := OLD.patient_id;
    ELSE
      v_patient_id := NEW.patient_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_patient_id := NULL;
  END;

  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_org_id := OLD.center_id;
    ELSE
      v_org_id := NEW.center_id;
    END IF;
  EXCEPTION WHEN undefined_column THEN
    v_org_id := NULL;
  END;

  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  PERFORM public.record_audit_event(
    p_user_id := v_user_id,
    p_user_role := current_setting('request.jwt.claims', true)::jsonb->>'role',
    p_organization_id := v_org_id,
    p_patient_id := v_patient_id,
    p_resource_type := TG_TABLE_NAME,
    p_resource_id := v_resource_id,
    p_action := v_action,
    p_status := 'success',
    p_metadata := v_metadata
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers to clinical tables
CREATE TRIGGER audit_patients_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

CREATE TRIGGER audit_sessions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

CREATE TRIGGER audit_assessments_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

CREATE TRIGGER audit_consents_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

CREATE TRIGGER audit_invoices_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

CREATE TRIGGER audit_autoregistro_entries_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.autoregistro_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_clinical_change();

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: Admin RPC for reading audit logs
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_audit_logs(
  p_from timestamptz DEFAULT now() - interval '7 days',
  p_to timestamptz DEFAULT now(),
  p_user_id uuid DEFAULT NULL,
  p_patient_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_resource_type text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_anomalous_only boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  seq bigint,
  user_id uuid,
  user_role text,
  organization_id uuid,
  patient_id uuid,
  resource_type text,
  resource_id text,
  action text,
  justification text,
  ip_address text,
  user_agent text,
  status text,
  metadata jsonb,
  previous_hash text,
  current_hash text,
  is_anomalous boolean,
  anomaly_reason text,
  user_first_name text,
  user_last_name text,
  patient_first_name text,
  patient_last_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller_center uuid;
BEGIN
  -- Only center admins can call this function (uses existing is_admin helper)
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: insufficient role';
  END IF;

  -- Get caller's center
  SELECT p.center_id INTO v_caller_center
  FROM public.profiles p
  WHERE p.id = auth.uid();

  RETURN QUERY
  SELECT
    al.id, al.created_at, al.seq,
    al.user_id, al.user_role, al.organization_id, al.patient_id,
    al.resource_type, al.resource_id, al.action, al.justification,
    al.ip_address, al.user_agent, al.status,
    al.metadata, al.previous_hash, al.current_hash,
    al.is_anomalous, al.anomaly_reason,
    prof.first_name AS user_first_name,
    prof.last_name AS user_last_name,
    pat.first_name AS patient_first_name,
    pat.last_name AS patient_last_name
  FROM public.audit_logs al
  LEFT JOIN public.profiles prof ON prof.id = al.user_id
  LEFT JOIN public.patients pat ON pat.id = al.patient_id
  WHERE al.created_at BETWEEN p_from AND p_to
    AND (p_user_id IS NULL OR al.user_id = p_user_id)
    AND (p_patient_id IS NULL OR al.patient_id = p_patient_id)
    AND (p_action IS NULL OR al.action = p_action)
    AND (p_resource_type IS NULL OR al.resource_type = p_resource_type)
    AND (p_status IS NULL OR al.status = p_status)
    AND (p_anomalous_only = false OR al.is_anomalous = true)
    AND al.organization_id = v_caller_center
    AND (
      p_search IS NULL OR
      al.resource_id ILIKE '%' || p_search || '%' OR
      al.route_or_endpoint ILIKE '%' || p_search || '%' OR
      al.anomaly_reason ILIKE '%' || p_search || '%'
    )
  ORDER BY al.seq DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_logs FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_audit_logs TO authenticated;