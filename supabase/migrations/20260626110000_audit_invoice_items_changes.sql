-- Audit invoice item mutations with the same tamper-evident audit chain used by invoices.

CREATE OR REPLACE FUNCTION public.audit_invoice_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_resource_id text;
  v_invoice_id uuid;
  v_patient_id uuid;
  v_center_id uuid;
  v_metadata jsonb;
  v_user_id uuid;
  v_user_role text;
  v_claims jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_resource_id := NEW.id::text;
    v_invoice_id := NEW.invoice_id;
    v_metadata := jsonb_build_object('new', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_resource_id := NEW.id::text;
    v_invoice_id := NEW.invoice_id;
    v_metadata := jsonb_build_object(
      'old', to_jsonb(OLD),
      'new', to_jsonb(NEW)
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_resource_id := OLD.id::text;
    v_invoice_id := OLD.invoice_id;
    v_metadata := jsonb_build_object('deleted', to_jsonb(OLD));
  END IF;

  SELECT i.patient_id, i.center_id
  INTO v_patient_id, v_center_id
  FROM public.invoices i
  WHERE i.id = v_invoice_id;

  BEGIN
    v_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  BEGIN
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_user_role := v_claims->>'role';
  EXCEPTION WHEN OTHERS THEN
    v_user_role := NULL;
  END;

  PERFORM public.record_audit_event(
    p_user_id := v_user_id,
    p_user_role := v_user_role,
    p_organization_id := v_center_id,
    p_patient_id := v_patient_id,
    p_resource_type := 'invoice_items',
    p_resource_id := v_resource_id,
    p_action := v_action,
    p_status := 'success',
    p_metadata := v_metadata || jsonb_build_object('invoice_id', v_invoice_id)
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_invoice_items_changes ON public.invoice_items;

CREATE TRIGGER audit_invoice_items_changes
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.audit_invoice_item_change();

COMMENT ON FUNCTION public.audit_invoice_item_change() IS
  'Records invoice_items create/update/delete operations in audit_logs with invoice-derived center and patient scope.';
