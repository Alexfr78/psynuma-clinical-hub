-- =====================================================================
-- Arreglos SEGUROS de avisos de seguridad de Supabase (Security Advisor)
-- Grupo A: search_path mutable + EXECUTE de anon en funciones que anon
-- nunca invoca (ni directamente ni a través de una política RLS).
-- No afecta a ninguna ruta pública tokenizada (/cita, /consentimiento,
-- /evaluacion, /emo, /factura, /pagar, /portal, /derivaciones/.../registro).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) function_search_path_mutable: fijar search_path en los 4 wrappers
--    de pgmq usados por process-email-queue. Sus cuerpos ya cualifican
--    todas las llamadas como pgmq.xxx(...), así que esto es un cambio
--    puramente defensivo, sin impacto funcional.
-- ---------------------------------------------------------------------
ALTER FUNCTION public.delete_email(queue_name text, message_id bigint) SET search_path = public;
ALTER FUNCTION public.enqueue_email(queue_name text, payload jsonb) SET search_path = public;
ALTER FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) SET search_path = public;
ALTER FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) SET search_path = public;

-- ---------------------------------------------------------------------
-- 2) Revocar EXECUTE de anon en funciones SECURITY DEFINER que anon no
--    invoca por ningún camino (ni RPC directo desde página pública, ni
--    embebidas en una política RLS de una tabla accesible por anon).
--    authenticated y service_role conservan su acceso sin cambios.
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public._calculate_professional_variable_amount_internal(p_professional_id uuid, p_center_id uuid, p_period_start date, p_period_end date, p_percentage_rate numeric, p_basis compensation_basis) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_verifactu_chain_lock(p_center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acquire_verifactu_chain_lock_v2(p_center_id uuid, p_nif_emisor text, p_lock_timeout_seconds integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_resolved_price_to_session() FROM anon;
REVOKE EXECUTE ON FUNCTION public.assert_invoice_items_mutable(p_invoice_id uuid, p_operation text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_clinical_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_invoice_item_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.audit_trigger_function() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_complete_past_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_create_center(p_name text, p_tax_id text, p_address text, p_city text, p_postal_code text, p_phone text, p_email text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.calculate_professional_variable_amount(p_professional_id uuid, p_period_start date, p_period_end date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_stripe_webhook_event(p_event_id text, p_event_type text, p_connected_account_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_rate_limit_entries() FROM anon;
REVOKE EXECUTE ON FUNCTION public.collect_session_payment_v2(p_session_id uuid, p_patient_id uuid, p_amount numeric, p_payment_method text, p_payment_date date, p_reference text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.compute_patient_status(p_patient_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.confirm_cancellation_charge(p_charge_id uuid, p_amount numeric, p_review_note text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_calendar_event_to_session(p_calendar_event_id uuid, p_patient_id uuid, p_session_type text, p_price numeric, p_session_modality text, p_location_id uuid, p_notes text, p_bono_id uuid, p_session_type_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.convert_calendar_event_to_session(p_calendar_event_id uuid, p_patient_id uuid, p_session_type text, p_price numeric, p_session_modality text, p_location_id uuid, p_notes text, p_bono_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_bono_with_debt(p_patient_id uuid, p_name text, p_total_sessions integer, p_price_per_session numeric, p_total_price numeric, p_expires_at timestamp with time zone, p_center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_f3_replacement(p_original_invoice_id uuid, p_series_id uuid, p_recipient jsonb, p_update_patient boolean, p_idempotency_key uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_rectificativa_substitution(p_original_invoice_id uuid, p_series_id uuid, p_recipient jsonb, p_update_patient boolean, p_idempotency_key uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_session_type_with_order(p_center_id uuid, p_name text, p_default_price numeric, p_duration_minutes integer, p_color text, p_commission_rate numeric, p_tax_treatment text, p_vat_rate numeric, p_exemption_code text, p_non_subject_code text, p_vat_regime_key text, p_is_public boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_bono_safely(p_bono_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_email(queue_name text, message_id bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_patient_gdpr(p_patient_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_payment_and_recompute_debt_v2(p_payment_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_dispatch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_queue_wake() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_single_current_version() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(queue_name text, payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_pending_debts_db() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_session_access_token() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_audit_logs(p_from timestamp with time zone, p_to timestamp with time zone, p_user_id uuid, p_patient_id uuid, p_action text, p_resource_type text, p_status text, p_anomalous_only boolean, p_search text, p_limit integer, p_offset integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_bono_sessions(p_bono_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_debt_id_for_payment_by_invoice(p_payment_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_invoice_type_correction_context(p_original_invoice_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_safe_center(p_center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_center_id(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_google_webhook_debounce(p_professional_id uuid, p_calendar_id text, p_debounce_seconds integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_rectificativa_payments(p_original_invoice_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role_in_center(_user_id uuid, _role app_role, _center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_professional(_user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_integration_error(p_professional_id uuid, p_provider text, p_source text, p_step text, p_http_status integer, p_error_code text, p_message text, p_raw jsonb, p_correlation_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.merge_patients(p_primary_id uuid, p_secondary_id uuid, p_field_overrides jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_invoice_financials_for_replacement(p_original_invoice_id uuid, p_target_invoice_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prevent_profile_center_self_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_consent_anon_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_invoice_immutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_invoice_items_immutability() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_issued_invoices() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_professional_payment_category() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_session_anon_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reassign_payment_to_invoice_v2(p_payment_id uuid, p_target_invoice_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_all_patient_statuses(p_center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_audit_event(p_user_id uuid, p_user_role text, p_organization_id uuid, p_patient_id uuid, p_resource_type text, p_resource_id text, p_action text, p_status text, p_ip_address text, p_user_agent text, p_session_id text, p_request_method text, p_route_or_endpoint text, p_justification text, p_metadata jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_verifactu_chain_lock(p_center_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_verifactu_chain_lock_v2(p_center_id uuid, p_lock_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_bono_from_session(p_session_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_patient_discharged(p_patient_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_session_types(p_center_id uuid, p_ordered_ids uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_applicable_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resolve_effective_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sanitize_error_payload(payload jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_expense_categories() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_patient_discharged(p_patient_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.special_days_set_updated_at() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trigger_update_patient_status_on_session_change() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_payment_and_recompute_debt_v2(p_payment_id uuid, p_amount numeric, p_payment_date timestamp with time zone, p_payment_method text, p_reference text, p_notes text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_session_datetime_force(p_session_id uuid, p_session_date date, p_start_time time without time zone, p_end_time time without time zone) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_can_create_center(_user_id uuid) FROM anon;

-- Índice duplicado de bajo riesgo (opcional, incluido aquí porque es
-- trivialmente seguro: el índice único completo ya cubre el caso del
-- parcial). Comentado por defecto — descomentar si se decide aplicarlo.
-- DROP INDEX IF EXISTS public.idx_centers_portal_slug;