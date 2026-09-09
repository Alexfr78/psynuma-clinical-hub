
DROP FUNCTION IF EXISTS public.merge_patients(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.merge_patients(
  p_primary_id uuid,
  p_secondary_id uuid,
  p_field_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary_center uuid;
  v_secondary_center uuid;
  v_user_id uuid;
  v_tables_affected jsonb := '{}'::jsonb;
  v_cnt integer;
  v_has_portal_primary boolean;
  v_has_portal_secondary boolean;
  v_field_key text;
  v_field_value text;
  v_update_sql text;
  v_verifactu_cnt integer;
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

  IF v_primary_center != get_user_center_id(v_user_id) THEN
    RAISE EXCEPTION 'You do not belong to this center';
  END IF;

  -- Reassign sessions
  UPDATE sessions SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('sessions', v_cnt);

  -- Facturas sin VeriFactu: actualizar normalmente
  UPDATE invoices
  SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id
    AND (verifactu_hash IS NULL AND verifactu_registration_id IS NULL);
  GET DIAGNOSTICS v_cnt = ROW_COUNT;

  -- Facturas con VeriFactu firmadas: SOLO patient_id, sin tocar updated_at
  UPDATE invoices
  SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id
    AND (verifactu_hash IS NOT NULL OR verifactu_registration_id IS NOT NULL);
  GET DIAGNOSTICS v_verifactu_cnt = ROW_COUNT;

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

  -- Reassign emotional_records
  UPDATE emotional_records SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('emotional_records', v_cnt);

  -- Reassign consents
  UPDATE consents SET patient_id = p_primary_id, updated_at = now()
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

  -- Handle patient_portal_accounts
  SELECT EXISTS(SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_primary_id AND is_active = true)
  INTO v_has_portal_primary;
  SELECT EXISTS(SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_secondary_id)
  INTO v_has_portal_secondary;

  IF v_has_portal_secondary THEN
    UPDATE patient_magic_links SET is_used = true
    WHERE patient_id = p_secondary_id AND is_used = false;

    IF v_has_portal_primary THEN
      DELETE FROM patient_portal_accounts WHERE patient_id = p_secondary_id;
    ELSE
      UPDATE patient_portal_accounts SET patient_id = p_primary_id
      WHERE patient_id = p_secondary_id;
    END IF;
    v_tables_affected := v_tables_affected || jsonb_build_object('patient_portal_accounts', 1);
  END IF;

  -- Reassign remaining magic links
  UPDATE patient_magic_links SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  v_tables_affected := v_tables_affected || jsonb_build_object('patient_magic_links', v_cnt);

  -- Apply field overrides
  IF p_field_overrides != '{}'::jsonb THEN
    FOR v_field_key, v_field_value IN SELECT * FROM jsonb_each_text(p_field_overrides)
    LOOP
      IF v_field_key = ANY(ARRAY[
        'first_name','last_name','email','phone','date_of_birth','gender',
        'tax_id','address','city','postal_code','notes','is_minor',
        'guardian_name','guardian_phone','guardian_email','guardian_relationship',
        'emergency_contact_name','emergency_contact_phone',
        'assigned_professional_id','status','auto_invoice_on_complete'
      ]) THEN
        v_update_sql := format('UPDATE patients SET %I = $1, updated_at = now() WHERE id = $2', v_field_key);
        EXECUTE v_update_sql USING v_field_value, p_primary_id;
      END IF;
    END LOOP;
  END IF;

  -- Delete secondary patient
  DELETE FROM patients WHERE id = p_secondary_id;

  -- Log the merge
  PERFORM record_audit_event(
    v_user_id,
    'MERGE',
    'patients',
    p_primary_id::text,
    p_primary_id,
    jsonb_build_object(
      'merged_patient_id', p_secondary_id,
      'kept_patient_id', p_primary_id,
      'fields_overridden', p_field_overrides,
      'tables_affected', v_tables_affected
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', p_primary_id,
    'merged_id', p_secondary_id,
    'tables_affected', v_tables_affected
  );
END;
$$;
