
CREATE OR REPLACE FUNCTION public.delete_patient_gdpr(p_patient_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
  v_patient_name text;
  v_deleted_counts jsonb;
  v_sessions int := 0;
  v_invoices int := 0;
  v_payments int := 0;
  v_debts int := 0;
  v_bonos int := 0;
  v_assessments int := 0;
  v_consents int := 0;
  v_autoregistro_entries int := 0;
  v_autoregistro_links int := 0;
  v_billable_events int := 0;
BEGIN
  -- SECURITY: Verify caller is authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- SECURITY: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No center assigned';
  END IF;

  -- SECURITY: Only admin can delete
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo los administradores pueden eliminar contactos (RGPD)';
  END IF;

  -- Verify patient belongs to caller's center
  SELECT center_id, first_name || ' ' || last_name
  INTO v_patient_center_id, v_patient_name
  FROM public.patients
  WHERE id = p_patient_id;

  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Contacto no encontrado o no pertenece a tu centro';
  END IF;

  -- Delete in dependency order (children first)

  -- 1. Assessment responses (via assessments)
  DELETE FROM public.assessment_responses
  WHERE assessment_id IN (SELECT id FROM public.assessments WHERE patient_id = p_patient_id);

  -- 2. Assessments
  DELETE FROM public.assessments WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_assessments = ROW_COUNT;

  -- 3. Consent signatures (via consents)
  DELETE FROM public.consent_signatures
  WHERE consent_id IN (SELECT id FROM public.consents WHERE patient_id = p_patient_id);

  -- 4. Consents
  DELETE FROM public.consents WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_consents = ROW_COUNT;

  -- 5. Autoregistro entries
  DELETE FROM public.autoregistro_entries WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_autoregistro_entries = ROW_COUNT;

  -- 6. Autoregistro links
  DELETE FROM public.autoregistro_links WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_autoregistro_links = ROW_COUNT;

  -- 7. Invoice items (via invoices)
  DELETE FROM public.invoice_items
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE patient_id = p_patient_id);

  -- 8. Payments
  DELETE FROM public.payments WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_payments = ROW_COUNT;

  -- 9. Debts
  DELETE FROM public.debts WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_debts = ROW_COUNT;

  -- 10. Invoices
  DELETE FROM public.invoices WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  -- 11. Bono items (via bonos)
  DELETE FROM public.bono_items
  WHERE bono_id IN (SELECT id FROM public.bonos WHERE patient_id = p_patient_id);

  -- 12. Bonos
  DELETE FROM public.bonos WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_bonos = ROW_COUNT;

  -- 13. Billable events
  DELETE FROM public.billable_events WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_billable_events = ROW_COUNT;

  -- 14. Sessions (unlink calendar events first)
  UPDATE public.calendar_events
  SET converted_session_id = NULL, is_converted = false, converted_at = NULL
  WHERE converted_session_id IN (SELECT id FROM public.sessions WHERE patient_id = p_patient_id);

  DELETE FROM public.sessions WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  -- 15. Finally delete the patient
  DELETE FROM public.patients WHERE id = p_patient_id;

  -- Log the GDPR deletion in audit_log
  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_values)
  VALUES (
    auth.uid(),
    'GDPR_DELETE',
    'patients',
    p_patient_id::text,
    jsonb_build_object('patient_name', v_patient_name, 'deleted_at', now())
  );

  RETURN jsonb_build_object(
    'success', true,
    'patient_name', v_patient_name,
    'deleted', jsonb_build_object(
      'sessions', v_sessions,
      'invoices', v_invoices,
      'payments', v_payments,
      'debts', v_debts,
      'bonos', v_bonos,
      'assessments', v_assessments,
      'consents', v_consents,
      'autoregistro_entries', v_autoregistro_entries,
      'autoregistro_links', v_autoregistro_links,
      'billable_events', v_billable_events
    )
  );
END;
$$;
