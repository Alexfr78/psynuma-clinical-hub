
CREATE OR REPLACE FUNCTION public.merge_patients(
  p_primary_id uuid,
  p_secondary_id uuid,
  p_resolved_fields jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_user_center_id uuid;
  v_primary_center_id uuid;
  v_secondary_center_id uuid;
  v_primary_record record;
  v_secondary_record record;
  v_counts jsonb := '{}'::jsonb;
  v_cnt integer;
  v_has_verifactu_invoices boolean := false;
  v_has_portal_primary boolean := false;
  v_has_portal_secondary boolean := false;
  v_tables_affected text[] := ARRAY[]::text[];
  v_field_key text;
  v_field_val jsonb;
  v_update_sql text := '';
  v_update_parts text[] := ARRAY[]::text[];
BEGIN
  -- Auth checks
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user_center_id := get_user_center_id(v_user_id);
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No center assigned';
  END IF;

  IF NOT (is_admin(v_user_id) OR is_professional(v_user_id)) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires admin or professional role';
  END IF;

  -- Cannot merge patient with itself
  IF p_primary_id = p_secondary_id THEN
    RAISE EXCEPTION 'Cannot merge a patient with itself';
  END IF;

  -- Verify both patients exist and belong to same center
  SELECT center_id INTO v_primary_center_id FROM patients WHERE id = p_primary_id;
  SELECT center_id INTO v_secondary_center_id FROM patients WHERE id = p_secondary_id;

  IF v_primary_center_id IS NULL THEN
    RAISE EXCEPTION 'Primary patient not found';
  END IF;
  IF v_secondary_center_id IS NULL THEN
    RAISE EXCEPTION 'Secondary patient not found';
  END IF;
  IF v_primary_center_id != v_secondary_center_id THEN
    RAISE EXCEPTION 'Cannot merge patients from different centers';
  END IF;
  IF v_primary_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Patients do not belong to your center';
  END IF;

  -- Check for Verifactu invoices on secondary patient
  SELECT EXISTS(
    SELECT 1 FROM invoices
    WHERE patient_id = p_secondary_id
      AND (verifactu_registration_id IS NOT NULL OR verifactu_hash IS NOT NULL)
  ) INTO v_has_verifactu_invoices;

  -- 1. Reassign sessions
  UPDATE sessions SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('sessions', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'sessions');
  END IF;

  -- 2. Reassign invoices (do NOT touch verifactu fields)
  UPDATE invoices SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('invoices', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'invoices');
  END IF;

  -- 3. Reassign payments
  UPDATE payments SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('payments', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'payments');
  END IF;

  -- 4. Reassign debts
  UPDATE debts SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('debts', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'debts');
  END IF;

  -- 5. Reassign bonos
  UPDATE bonos SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('bonos', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'bonos');
  END IF;

  -- 6. Reassign assessments
  UPDATE assessments SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('assessments', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'assessments');
  END IF;

  -- 7. Reassign autoregistro entries
  UPDATE autoregistro_entries SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('autoregistro_entries', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'autoregistro_entries');
  END IF;

  -- 8. Reassign autoregistro links
  UPDATE autoregistro_links SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('autoregistro_links', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'autoregistro_links');
  END IF;

  -- 9. Reassign emotional records
  UPDATE emotional_records SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('emotional_records', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'emotional_records');
  END IF;

  -- 10. Reassign consents
  UPDATE consents SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('consents', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'consents');
  END IF;

  -- 11. Reassign notifications
  UPDATE notifications SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('notifications', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'notifications');
  END IF;

  -- 12. Reassign recurring series
  UPDATE recurring_series SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('recurring_series', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'recurring_series');
  END IF;

  -- 13. Reassign billable events
  UPDATE billable_events SET patient_id = p_primary_id, updated_at = now()
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('billable_events', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'billable_events');
  END IF;

  -- 14. Reassign WhatsApp messages
  UPDATE whatsapp_messages SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('whatsapp_messages', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'whatsapp_messages');
  END IF;

  -- 15. Reassign audit_logs (preserve RGPD trail)
  UPDATE audit_logs SET patient_id = p_primary_id
  WHERE patient_id = p_secondary_id;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt > 0 THEN
    v_counts := v_counts || jsonb_build_object('audit_logs', v_cnt);
    v_tables_affected := array_append(v_tables_affected, 'audit_logs');
  END IF;

  -- 16. Handle portal accounts
  SELECT EXISTS(SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_primary_id)
  INTO v_has_portal_primary;
  SELECT EXISTS(SELECT 1 FROM patient_portal_accounts WHERE patient_id = p_secondary_id)
  INTO v_has_portal_secondary;

  IF v_has_portal_secondary THEN
    -- Invalidate all magic links for secondary
    UPDATE patient_magic_links SET expires_at = now(), used_at = now()
    WHERE patient_id = p_secondary_id AND used_at IS NULL;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    IF v_cnt > 0 THEN
      v_counts := v_counts || jsonb_build_object('patient_magic_links_invalidated', v_cnt);
    END IF;

    IF v_has_portal_primary THEN
      -- Both have portal: deactivate secondary's
      UPDATE patient_portal_accounts SET is_active = false, updated_at = now()
      WHERE patient_id = p_secondary_id;
      -- Delete secondary magic links
      DELETE FROM patient_magic_links WHERE patient_id = p_secondary_id;
      -- Delete secondary portal account
      DELETE FROM patient_portal_accounts WHERE patient_id = p_secondary_id;
      v_tables_affected := array_append(v_tables_affected, 'patient_portal_accounts');
    ELSE
      -- Only secondary has portal: reassign to primary
      UPDATE patient_portal_accounts SET patient_id = p_primary_id, updated_at = now()
      WHERE patient_id = p_secondary_id;
      UPDATE patient_magic_links SET patient_id = p_primary_id
      WHERE patient_id = p_secondary_id;
      v_tables_affected := array_append(v_tables_affected, 'patient_portal_accounts');
      v_tables_affected := array_append(v_tables_affected, 'patient_magic_links');
    END IF;
  ELSE
    -- No portal on secondary, just clean up any orphan magic links
    DELETE FROM patient_magic_links WHERE patient_id = p_secondary_id;
  END IF;

  -- 17. Apply resolved fields to primary patient
  IF p_resolved_fields IS NOT NULL AND p_resolved_fields != '{}'::jsonb THEN
    FOR v_field_key, v_field_val IN SELECT * FROM jsonb_each(p_resolved_fields)
    LOOP
      -- Only allow known safe columns
      IF v_field_key = ANY(ARRAY[
        'first_name','last_name','email','phone','date_of_birth','gender',
        'tax_id','address','city','postal_code','notes','is_minor',
        'guardian_name','guardian_phone','guardian_email','guardian_relationship',
        'emergency_contact_name','emergency_contact_phone',
        'assigned_professional_id','status','auto_invoice_on_complete'
      ]) THEN
        v_update_parts := array_append(v_update_parts,
          format('%I = %L', v_field_key, v_field_val #>> '{}')
        );
      END IF;
    END LOOP;

    IF array_length(v_update_parts, 1) > 0 THEN
      v_update_sql := 'UPDATE patients SET ' ||
        array_to_string(v_update_parts, ', ') ||
        ', updated_at = now() WHERE id = ' || quote_literal(p_primary_id);
      EXECUTE v_update_sql;
    END IF;
  END IF;

  -- 18. Log the merge in audit_logs
  PERFORM public.record_audit_event(
    p_user_id := v_user_id,
    p_user_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', 'authenticated'),
    p_organization_id := v_user_center_id,
    p_patient_id := p_primary_id,
    p_resource_type := 'patients',
    p_resource_id := p_primary_id::text,
    p_action := 'MERGE',
    p_status := 'success',
    p_metadata := jsonb_build_object(
      'merged_patient_id', p_secondary_id,
      'kept_patient_id', p_primary_id,
      'fields_overridden', (SELECT array_agg(k) FROM jsonb_object_keys(p_resolved_fields) AS k),
      'tables_affected', v_tables_affected,
      'record_counts', v_counts,
      'has_verifactu_invoices', v_has_verifactu_invoices,
      'merged_by', v_user_id
    )
  );

  -- 19. Delete the secondary patient (all FKs have been reassigned)
  DELETE FROM patients WHERE id = p_secondary_id;

  RETURN jsonb_build_object(
    'success', true,
    'primary_id', p_primary_id,
    'secondary_id', p_secondary_id,
    'record_counts', v_counts,
    'tables_affected', v_tables_affected,
    'has_verifactu_invoices', v_has_verifactu_invoices
  );
END;
$function$;
