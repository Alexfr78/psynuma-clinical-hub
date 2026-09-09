
CREATE OR REPLACE FUNCTION public.merge_patients(
  p_primary_id uuid,
  p_secondary_id uuid,
  p_field_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_primary_center uuid;
  v_secondary_center uuid;
  v_user_id uuid;
  v_user_center_id uuid;
  v_tables_affected jsonb := '{}'::jsonb;
  v_cnt integer;
  v_has_portal_primary boolean;
  v_has_portal_secondary boolean;
  v_field_key text;
  v_field_val jsonb;
  v_update_parts text[] := '{}';
  v_update_sql text;
  v_verifactu_cnt integer;
  v_has_verifactu_invoices boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'Cannot merge a patient with itself';
  END IF;

  IF NOT (is_professional(v_user_id) OR is_admin(v_user_id)) THEN
    RAISE EXCEPTION 'Insufficient permissions to merge patients';
  END IF;

  SELECT center_id INTO v_primary_center FROM patients WHERE id = p_primary_id;
  SELECT center_id INTO v_secondary_center FROM patients WHERE id = p_secondary_id;

  IF v_primary_center IS NULL OR v_secondary_center IS NULL THEN
    RAISE EXCEPTION 'One or both patients not found';
  END IF;

  IF v_primary_center != v_secondary_center THEN
    RAISE EXCEPTION 'Cannot merge patients from different centers';
  END IF;

  v_user_center_id := get_user_center_id(v_user_id);

  IF v_primary_center != v_user_center_id THEN
    RAISE EXCEPTION 'You do not belong to this center';
  END IF;

  -- Reassign sessions
  UPDATE sessions SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('sessions', v_cnt);

  -- Facturas sin VeriFactu
  UPDATE invoices
  SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id
    AND (verifactu_hash IS NULL AND verifactu_registration_id IS NULL);
  GET DIAGNOSTICS v_cnt = ROW_COUNT;

  -- Facturas con VeriFactu firmadas
  UPDATE invoices
  SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id
    AND (verifactu_hash IS NOT NULL OR verifactu_registration_id IS NOT NULL);
  GET DIAGNOSTICS v_verifactu_cnt = ROW_COUNT;

  IF v_verifactu_cnt > 0 THEN
    v_has_verifactu_invoices := true;
  END IF;

  v_tables_affected := v_tables_affected || jsonb_build_object('invoices', v_cnt + v_verifactu_cnt, 'invoices_verifactu', v_verifactu_cnt);

  -- Reassign payments
  UPDATE payments SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('payments', v_cnt);

  -- Reassign debts
  UPDATE debts SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('debts', v_cnt);

  -- Reassign bonos
  UPDATE bonos SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('bonos', v_cnt);

  -- Reassign assessments
  UPDATE assessments SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('assessments', v_cnt);

  -- Reassign autoregistro_entries
  UPDATE autoregistro_entries SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('autoregistro_entries', v_cnt);

  -- Reassign autoregistro_links
  UPDATE autoregistro_links SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('autoregistro_links', v_cnt);

  -- Reassign consents
  UPDATE consents SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('consents', v_cnt);

  -- Reassign audit_logs
  UPDATE audit_logs SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('audit_logs', v_cnt);

  -- Reassign notifications
  UPDATE notifications SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('notifications', v_cnt);

  -- Reassign whatsapp_messages
  UPDATE whatsapp_messages SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('whatsapp_messages', v_cnt);

  -- Reassign recurring_series
  UPDATE recurring_series SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('recurring_series', v_cnt);

  -- Reassign billable_events
  UPDATE billable_events SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('billable_events', v_cnt);

  -- Apply field overrides with proper type casting
  IF p_field_overrides != '{}'::jsonb THEN
    FOR v_field_key, v_field_val IN SELECT * FROM jsonb_each(p_field_overrides)
    LOOP
      IF v_field_key = ANY(ARRAY[
        'first_name','last_name','email','phone','date_of_birth','gender',
        'tax_id','address','city','postal_code','notes',
        'guardian_name','guardian_phone','guardian_email','guardian_relationship',
        'emergency_contact_name','emergency_contact_phone',
        'status','status_reason'
      ]) THEN
        v_update_parts := array_append(v_update_parts,
          format('%I = %L', v_field_key, v_field_val #>> '{}')
        );
      ELSIF v_field_key = ANY(ARRAY['assigned_professional_id']) THEN
        v_update_parts := array_append(v_update_parts,
          format('%I = %L::uuid', v_field_key, v_field_val #>> '{}')
        );
      ELSIF v_field_key = ANY(ARRAY['is_minor','auto_invoice_on_complete']) THEN
        v_update_parts := array_append(v_update_parts,
          format('%I = %L::boolean', v_field_key, v_field_val #>> '{}')
        );
      END IF;
    END LOOP;

    IF array_length(v_update_parts, 1) > 0 THEN
      v_update_sql := 'UPDATE patients SET ' || array_to_string(v_update_parts, ', ') ||
                       ', updated_at = now() WHERE id = $1';
      EXECUTE v_update_sql USING p_primary_id;
    END IF;
  END IF;

  -- Handle portal accounts
  SELECT EXISTS (SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_primary_id AND is_active = true) INTO v_has_portal_primary;
  SELECT EXISTS (SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_secondary_id AND is_active = true) INTO v_has_portal_secondary;

  IF v_has_portal_secondary AND NOT v_has_portal_primary THEN
    UPDATE patient_portal_accounts SET patient_id = p_primary_id WHERE patient_id = p_secondary_id;
  ELSIF v_has_portal_secondary AND v_has_portal_primary THEN
    UPDATE patient_portal_accounts SET is_active = false WHERE patient_id = p_secondary_id;
  END IF;

  -- Delete secondary patient
  DELETE FROM patients WHERE id = p_secondary_id;

  -- Audit log
  PERFORM public.record_audit_event(
    p_user_id         := v_user_id,
    p_user_role       := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'authenticated'),
    p_organization_id := v_user_center_id,
    p_patient_id      := p_primary_id,
    p_resource_type   := 'patients',
    p_resource_id     := p_primary_id::text,
    p_action          := 'MERGE',
    p_status          := 'success',
    p_metadata        := jsonb_build_object(
      'merged_patient_id',      p_secondary_id,
      'kept_patient_id',        p_primary_id,
      'fields_overridden',      (SELECT array_agg(k) FROM jsonb_object_keys(p_field_overrides) AS k),
      'tables_affected',        v_tables_affected,
      'has_verifactu_invoices', v_has_verifactu_invoices,
      'merged_by',              v_user_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', p_primary_id,
    'secondary_id_deleted', p_secondary_id,
    'tables_affected', v_tables_affected,
    'has_verifactu_invoices', v_has_verifactu_invoices
  );
END;
$function$;
