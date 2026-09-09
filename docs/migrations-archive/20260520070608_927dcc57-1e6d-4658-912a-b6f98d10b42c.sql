CREATE OR REPLACE FUNCTION public.delete_patient_gdpr(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
  v_patient_name text;
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No center assigned';
  END IF;

  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo los administradores pueden eliminar contactos (RGPD)';
  END IF;

  SELECT center_id, first_name || ' ' || last_name
  INTO v_patient_center_id, v_patient_name
  FROM public.patients
  WHERE id = p_patient_id;

  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Contacto no encontrado o no pertenece a tu centro';
  END IF;

  DELETE FROM public.assessment_responses
  WHERE assessment_id IN (SELECT id FROM public.assessments WHERE patient_id = p_patient_id);

  DELETE FROM public.assessments WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_assessments = ROW_COUNT;

  DELETE FROM public.consent_signatures
  WHERE consent_id IN (SELECT id FROM public.consents WHERE patient_id = p_patient_id);

  DELETE FROM public.consents WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_consents = ROW_COUNT;

  DELETE FROM public.autoregistro_entries WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_autoregistro_entries = ROW_COUNT;

  DELETE FROM public.autoregistro_links WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_autoregistro_links = ROW_COUNT;

  DELETE FROM public.invoice_items
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE patient_id = p_patient_id);

  DELETE FROM public.payments WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_payments = ROW_COUNT;

  DELETE FROM public.debts WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_debts = ROW_COUNT;

  DELETE FROM public.invoices WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_invoices = ROW_COUNT;

  DELETE FROM public.bono_items
  WHERE bono_id IN (SELECT id FROM public.bonos WHERE patient_id = p_patient_id);

  DELETE FROM public.bonos WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_bonos = ROW_COUNT;

  DELETE FROM public.billable_events WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_billable_events = ROW_COUNT;

  UPDATE public.calendar_events
  SET converted_session_id = NULL, is_converted = false, converted_at = NULL
  WHERE converted_session_id IN (SELECT id FROM public.sessions WHERE patient_id = p_patient_id);

  DELETE FROM public.sessions WHERE patient_id = p_patient_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  DELETE FROM public.patients WHERE id = p_patient_id;

  INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_values)
  VALUES (
    auth.uid(),
    'GDPR_DELETE',
    'patients',
    p_patient_id,
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
$function$;