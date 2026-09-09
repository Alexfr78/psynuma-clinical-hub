-- =============================================================================
-- MIGRACIÓN BASE (baseline) — Psycma
--
-- Refleja el esquema de la base de datos de PRODUCCIÓN a fecha 2026-09-09
-- (proyecto Supabase zprkdxmluvirxfhswrzq, Lovable Cloud, Europa/Zúrich,
-- PostgreSQL 17.6).
--
-- POR QUÉ EXISTE
-- El historial anterior eran 329 migraciones que NO se podían reproducir desde
-- cero: Lovable regeneraba migraciones ya escritas a mano, con otro nombre de
-- archivo y el mismo SQL. Al replicar la cadena en una base limpia fallaban 12
-- migraciones (columnas, tipos, triggers y tablas duplicados, dependencias fuera
-- de orden y un choque de tipos en un UNION), y el resultado tenía 91 tablas en
-- vez de 92. Además el registro estaba incompleto: 263 filas en
-- supabase_migrations.schema_migrations frente a 329 archivos, de las que solo 72
-- coincidían exactamente con un nombre de archivo.
--
-- El histórico se conserva en docs/migrations-archive/ y, por supuesto, en git.
--
-- CÓMO SE GENERÓ
-- El bloque del esquema `public` se extrajo de producción por introspección de
-- catálogos (pg_get_functiondef, pg_get_viewdef, pg_get_indexdef,
-- pg_get_constraintdef, pg_get_triggerdef, pg_policies y aclexplode sobre
-- pg_class.relacl). Se excluyen a propósito los objetos que pertenecen a
-- extensiones: btree_gist está instalada EN public y aporta 188 funciones que no
-- son de la aplicación.
--
-- El resto (extensiones, buckets, políticas de storage, trigger sobre auth.users
-- y trabajos de pg_cron) no aparece en un volcado de `public` y se añadió aparte.
--
-- CONTENIDO
--   20 enums · 92 tablas · 146 funciones · 5 vistas · 445 constraints
--   282 índices · 92 triggers · 221 políticas RLS · 277 grants
--   4 buckets · 16 políticas sobre storage.objects · 18 trabajos de cron
--
-- AVISO SOBRE SECRETOS
-- Los trabajos de cron leen el secreto de `vault`. En producción, 7 de ellos lo
-- llevaban escrito en claro dentro de cron.job.command; se migraron a vault el
-- 2026-09-09. Antes de levantar un entorno nuevo hay que crear los secretos de
-- vault que se listan en la sección de crons.
-- =============================================================================

-- =============================================================================
-- 1. EXTENSIONES
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net         WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron        WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS btree_gist     WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
-- pgmq@pgmq y plpgsql@pg_catalog los provisiona Supabase; no se recrean aquí.


-- =============================================================================
-- 2. ESQUEMA public
-- =============================================================================

-- Las funciones se crean en el orden en que las devuelve el catálogo, que no es
-- orden de dependencias. Las funciones LANGUAGE sql validan su cuerpo al crearse,
-- así que una que referencie a otra definida más abajo fallaría. Desactivamos esa
-- validación durante la carga, igual que hace pg_restore.
SET check_function_bodies = off;

CREATE TYPE public.app_role AS ENUM ('admin', 'professional', 'patient');

CREATE TYPE public.assessment_status AS ENUM ('pending', 'completed', 'expired', 'revoked');

CREATE TYPE public.bono_status AS ENUM ('active', 'exhausted', 'expired', 'cancelled');

CREATE TYPE public.compensation_basis AS ENUM ('collected_payments', 'issued_invoices');

CREATE TYPE public.compensation_type AS ENUM ('fixed', 'percentage', 'mixed');

CREATE TYPE public.consent_status AS ENUM ('pending', 'signed', 'revoked', 'expired');

CREATE TYPE public.expense_kind AS ENUM ('fixed_recurring', 'variable', 'supplier_invoice', 'professional_payment');

CREATE TYPE public.expense_recurrence_frequency AS ENUM ('monthly', 'quarterly', 'yearly');

CREATE TYPE public.expense_status AS ENUM ('pending', 'paid', 'cancelled');

CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'paid', 'cancelled');

CREATE TYPE public.location_type_enum AS ENUM ('in_person', 'online');

CREATE TYPE public.notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TYPE public.notification_type AS ENUM ('email', 'sms', 'whatsapp');

CREATE TYPE public.patient_status AS ENUM ('active', 'inactive', 'discharged');

CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'partial', 'refunded');

CREATE TYPE public.schedule_exception_reason AS ENUM ('holiday', 'vacation', 'sick_leave', 'training', 'closure', 'other');

CREATE TYPE public.schedule_exception_scope AS ENUM ('center', 'professional');

CREATE TYPE public.session_status AS ENUM ('draft', 'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'blocked', 'pending_approval', 'reschedule_requested');

CREATE TYPE public.special_day_scope AS ENUM ('center', 'professional');

CREATE TYPE public.special_day_type AS ENUM ('closed', 'custom', 'extended');

CREATE TABLE public.ai_document_defaults (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid,
  audience text NOT NULL,
  document_type_id uuid NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_by uuid
);

CREATE TABLE public.ai_document_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid,
  key text NOT NULL,
  label text NOT NULL,
  description text,
  audience text NOT NULL,
  scope text DEFAULT 'session'::text NOT NULL,
  requires text[] DEFAULT '{}'::text[] NOT NULL,
  sections jsonb DEFAULT '[]'::jsonb NOT NULL,
  input_schema jsonb DEFAULT '{}'::jsonb NOT NULL,
  required_consent_purposes text[] DEFAULT '{ai_processing,report_generation}'::text[] NOT NULL,
  mirror_column text,
  default_user_prompt text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  professional_id uuid
);

CREATE TABLE public.ai_generated_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  session_id uuid,
  patient_id uuid NOT NULL,
  document_type_id uuid NOT NULL,
  prompt_version_id uuid,
  source_session_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  content_sections jsonb NOT NULL,
  content_markdown text NOT NULL,
  edited_sections jsonb,
  edited_markdown text,
  transcript_source text,
  plaud_recording_id uuid,
  model_used text,
  tokens_in integer,
  tokens_out integer,
  generated_by uuid,
  generated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_prompt_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_type_id uuid NOT NULL,
  center_id uuid NOT NULL,
  version integer NOT NULL,
  system_prompt text,
  user_prompt text NOT NULL,
  model text,
  temperature real,
  professional_id uuid,
  session_type_id uuid,
  is_published boolean DEFAULT false NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_change_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  description text,
  module text NOT NULL,
  change_type text NOT NULL,
  affects_verifactu boolean DEFAULT false NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  version_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  version_code text NOT NULL,
  version_name text,
  description text,
  status text DEFAULT 'draft'::text NOT NULL,
  is_current boolean DEFAULT false NOT NULL,
  published_at timestamp with time zone,
  applies_to_verifactu boolean DEFAULT false NOT NULL,
  verifactu_synced_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assessment_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  assessment_id uuid NOT NULL,
  answers jsonb NOT NULL,
  factor_scores jsonb NOT NULL,
  flags jsonb,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.assessment_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  version integer DEFAULT 1 NOT NULL,
  items jsonb NOT NULL,
  scoring jsonb NOT NULL,
  instructions text,
  interpretations jsonb,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  response_min integer DEFAULT 1 NOT NULL,
  response_max integer DEFAULT 7 NOT NULL,
  chart_full_mark numeric DEFAULT 7 NOT NULL,
  flag_threshold numeric DEFAULT 4 NOT NULL,
  min_label text,
  max_label text
);

CREATE TABLE public.assessments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  template_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  status assessment_status DEFAULT 'pending'::assessment_status NOT NULL,
  access_token text DEFAULT encode(extensions.gen_random_bytes(24), 'hex'::text) NOT NULL,
  sent_via text,
  sent_to text,
  sent_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  user_agent text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_id uuid,
  user_role text,
  organization_id uuid,
  patient_id uuid,
  resource_type text NOT NULL,
  resource_id text,
  action text NOT NULL,
  justification text,
  ip_address text,
  user_agent text,
  session_id text,
  request_method text,
  route_or_endpoint text,
  status text DEFAULT 'success'::text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  previous_hash text,
  current_hash text NOT NULL,
  is_anomalous boolean DEFAULT false NOT NULL,
  anomaly_reason text
);

CREATE TABLE public.autoregistro_alert_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_id uuid NOT NULL,
  rule_id uuid NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  fired_at timestamp with time zone DEFAULT now() NOT NULL,
  notification_method text,
  success boolean DEFAULT false NOT NULL,
  error_message text,
  severity text
);

CREATE TABLE public.autoregistro_alert_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  template_id uuid NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
  logic_operator text DEFAULT 'OR'::text NOT NULL,
  consecutive_count integer DEFAULT 1 NOT NULL,
  severity text DEFAULT 'warning'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.autoregistro_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  link_id uuid NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  template_id uuid NOT NULL,
  "values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  submitted_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.autoregistro_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  template_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  access_token text DEFAULT (gen_random_uuid())::text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  allow_multiple boolean DEFAULT true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.autoregistro_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  fields jsonb DEFAULT '[]'::jsonb NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  patient_feedback_enabled boolean DEFAULT false
);

CREATE TABLE public.availability (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  is_available boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  session_type_id uuid
);

CREATE TABLE public.billable_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  session_id uuid,
  patient_id uuid NOT NULL,
  concept text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  billing_status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bono_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bono_id uuid NOT NULL,
  session_id uuid,
  used_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.bono_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  total_sessions integer NOT NULL,
  price_per_session numeric NOT NULL,
  total_price numeric NOT NULL,
  validity_days integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_public boolean DEFAULT false
);

CREATE TABLE public.bonos (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  name text NOT NULL,
  total_sessions integer NOT NULL,
  used_sessions integer DEFAULT 0,
  price_per_session numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  status bono_status DEFAULT 'active'::bono_status,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  template_id uuid,
  base_price_snapshot numeric(10,2),
  pricing_source text,
  custom_price_id uuid,
  tariff_plan_id_snapshot uuid,
  tariff_plan_assignment_id_snapshot uuid,
  stripe_checkout_session_id text
);

CREATE TABLE public.calendar_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  provider text NOT NULL,
  professional_id uuid NOT NULL,
  calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  status text,
  summary text,
  description text,
  location text,
  start_at timestamp with time zone,
  end_at timestamp with time zone,
  all_day boolean DEFAULT false,
  updated_at_google timestamp with time zone,
  etag text,
  deleted boolean DEFAULT false,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_converted boolean DEFAULT false,
  converted_session_id uuid,
  converted_at timestamp with time zone
);

CREATE TABLE public.cancellation_charges (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  session_id uuid,
  policy_version_id uuid,
  status text DEFAULT 'pending_review'::text NOT NULL,
  amount numeric(10,2) DEFAULT 0 NOT NULL,
  original_amount numeric(10,2) DEFAULT 0 NOT NULL,
  percentage numeric(5,2) DEFAULT 0 NOT NULL,
  base_session_price numeric(10,2) DEFAULT 0 NOT NULL,
  concept text DEFAULT 'Penalización por cancelación fuera de plazo'::text NOT NULL,
  review_note text,
  debt_id uuid,
  invoice_id uuid,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  stripe_payment_intent_id text,
  off_session_error text
);

CREATE TABLE public.cancellation_policy_versions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  version_number integer DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT false NOT NULL,
  rules jsonb DEFAULT '{}'::jsonb NOT NULL,
  valid_reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
  penalty_invoice_concept text DEFAULT 'Cancelación fuera de plazo según política aceptada'::text NOT NULL,
  rectification_reason text DEFAULT 'Devolución por cancelación de cita'::text NOT NULL,
  voucher_validity_days integer DEFAULT 365 NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  policy_text text
);

CREATE TABLE public.center_drive_connections (
  center_id uuid NOT NULL,
  connected_by uuid,
  google_account_email text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamp with time zone,
  drive_root_folder_id text,
  enabled boolean DEFAULT true NOT NULL,
  needs_reconnect boolean DEFAULT false NOT NULL,
  last_upload_at timestamp with time zone,
  last_upload_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.center_locations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  street text,
  number_details text,
  city text,
  postal_code text,
  country text DEFAULT 'España'::text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_public boolean DEFAULT true,
  location_type location_type_enum DEFAULT 'in_person'::location_type_enum
);

CREATE TABLE public.center_plaud_connections (
  center_id uuid NOT NULL,
  connected_by uuid,
  plaud_account_label text,
  plaud_client_id_encrypted text,
  plaud_client_secret_encrypted text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamp with time zone,
  scope text,
  enabled boolean DEFAULT false NOT NULL,
  needs_reconnect boolean DEFAULT false NOT NULL,
  last_refresh_at timestamp with time zone,
  last_refresh_result text,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.centers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  tax_id text,
  address text,
  city text,
  postal_code text,
  phone text,
  email text,
  logo_url text,
  invoice_prefix text DEFAULT 'FAC'::text,
  invoice_next_number integer DEFAULT 1,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  country text DEFAULT 'España'::text,
  province text,
  address_details text,
  default_tax_name text DEFAULT 'IVA'::text,
  default_tax_rate numeric DEFAULT 21,
  include_tax_in_price boolean DEFAULT false,
  retention_name text DEFAULT 'IRPF'::text,
  retention_rate numeric DEFAULT 0,
  invoice_footer text,
  invoice_logo_url text,
  auto_invoicing_enabled boolean DEFAULT false,
  whatsapp_send_method text DEFAULT 'web'::text,
  whatsapp_access_token text,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  verifactu_certificate_base64 text,
  verifactu_certificate_password text,
  verifactu_environment text DEFAULT 'test'::text,
  verifactu_software_name text DEFAULT 'Psynuma'::text,
  verifactu_software_version text DEFAULT '1.0.0'::text,
  verifactu_software_nif text,
  reschedule_max_days integer DEFAULT 30,
  reschedule_slot_duration integer DEFAULT 30,
  reschedule_require_confirmation boolean DEFAULT false,
  verifactu_sistema_informatico text DEFAULT 'PSYCMA'::text,
  oauth_google_credentials text,
  oauth_zoom_credentials text,
  oauth_stripe_credentials text,
  oauth_google_client_id text,
  oauth_zoom_client_id text,
  oauth_stripe_publishable_key text,
  default_payment_mode text DEFAULT 'in_session'::text,
  default_scheduled_hours_before integer DEFAULT 24,
  payment_reminder_enabled boolean DEFAULT true,
  payment_reminder_hours_after integer DEFAULT 24,
  payment_reminder_max_count integer DEFAULT 3,
  payment_reminder_interval_hours integer DEFAULT 48,
  consent_expiration_days integer DEFAULT 7,
  portal_slug text,
  portal_enabled boolean DEFAULT false,
  portal_require_approval boolean DEFAULT true,
  portal_allow_professional_selection boolean DEFAULT false,
  portal_default_professional_id uuid,
  invoice_on_payment_mode text DEFAULT 'disabled'::text,
  invoice_send_channel text DEFAULT 'email'::text,
  session_reminder_enabled boolean DEFAULT true,
  session_reminder_timing text DEFAULT '24_hours'::text,
  session_reminder_hours_before integer DEFAULT 24,
  session_reminder_channels jsonb DEFAULT '{"sms": false, "email": true, "whatsapp": true}'::jsonb,
  verifactu_auto_enabled boolean DEFAULT false,
  custom_domain text,
  agenda_show_weekends boolean DEFAULT true,
  public_booking_enabled boolean DEFAULT false,
  admin_alerts_enabled boolean DEFAULT true,
  admin_alerts_emails text,
  admin_alerts_events jsonb DEFAULT '{"payment_online": true, "portal_created": true, "booking_created": true, "portal_cancelled": true, "booking_cancelled": true, "booking_rescheduled": true, "assessment_completed": true}'::jsonb,
  admin_alerts_include_professional boolean DEFAULT true,
  verifactu_numero_instalacion integer DEFAULT 1,
  bizum_phone text,
  public_domain text,
  portal_agenda_closed boolean DEFAULT false,
  wasender_enabled boolean DEFAULT false,
  wasender_auto_reminders boolean DEFAULT true,
  wasender_reminder_24h boolean DEFAULT true,
  wasender_reminder_2h boolean DEFAULT true,
  wasender_confirm_booking boolean DEFAULT true,
  wasender_notify_cancellation boolean DEFAULT true,
  wasender_emergency_stop boolean DEFAULT false,
  invoice_data_protection_text text,
  wasender_notify_reschedule boolean DEFAULT true,
  wasender_confirmation_reply boolean DEFAULT true,
  ai_provider text DEFAULT 'openai'::text,
  openai_api_key_encrypted text,
  openai_model text DEFAULT 'gpt-4.1'::text,
  gemini_api_key_encrypted text,
  gemini_model text DEFAULT 'gemini-2.5-pro'::text,
  ai_prompt_system text,
  ai_prompt_layer1 text,
  ai_prompt_layer2 text,
  ai_prompt_layer3 text,
  transcript_retention_days integer DEFAULT 7,
  ai_temperature real DEFAULT 0.3,
  ai_analysis_mode text DEFAULT 'layered'::text,
  bank_transfer_info text,
  default_advance_payment_limit_hours integer DEFAULT 12,
  auto_cancel_unpaid_advance_sessions boolean DEFAULT false,
  unpaid_advance_cancellation_alert_threshold integer DEFAULT 2,
  cancellation_policy_enabled boolean DEFAULT false NOT NULL,
  card_on_booking_mode text DEFAULT 'off'::text NOT NULL,
  oauth_google_drive_client_id text,
  oauth_google_drive_credentials text,
  is_software_provider boolean DEFAULT false NOT NULL
);

CREATE TABLE public.communication_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  channel text NOT NULL,
  template_type text NOT NULL,
  email_initial_text text,
  email_confirmation_text text,
  email_videocall_text text,
  email_payment_text text,
  sms_message text,
  whatsapp_message text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  email_subject text,
  email_footer text,
  payment_option_stripe text,
  payment_option_bizum text,
  payment_option_bono text,
  payment_option_transfer text
);

CREATE TABLE public.consent_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  consent_id uuid NOT NULL,
  signer_name text NOT NULL,
  signer_role text NOT NULL,
  signature_order integer NOT NULL,
  signature_data text NOT NULL,
  ip_address text,
  user_agent text,
  signed_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.consent_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  content_html text NOT NULL,
  requires_guardian_signature boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  verification_checkboxes jsonb DEFAULT '[]'::jsonb,
  requires_emergency_contact boolean DEFAULT false NOT NULL
);

CREATE TABLE public.consents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  template_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  status consent_status DEFAULT 'pending'::consent_status,
  access_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
  content_snapshot text NOT NULL,
  requires_guardian boolean DEFAULT false,
  expires_at timestamp with time zone,
  signed_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revocation_reason text,
  signed_pdf_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  verification_responses jsonb,
  uploaded_file_url text,
  source text DEFAULT 'digital'::text,
  cancellation_policy_version_id uuid,
  emergency_contact_name text,
  emergency_contact_phone text
);

CREATE TABLE public.debts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  invoice_id uuid,
  session_id uuid,
  amount numeric(10,2) NOT NULL,
  paid_amount numeric(10,2) DEFAULT 0,
  status payment_status DEFAULT 'pending'::payment_status,
  due_date date,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  bono_id uuid,
  stripe_checkout_session_id text,
  stripe_payment_status text,
  access_token text DEFAULT (gen_random_uuid())::text
);

CREATE TABLE public.email_send_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id text,
  template_name text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_send_state (
  id integer DEFAULT 1 NOT NULL,
  retry_after_until timestamp with time zone,
  batch_size integer DEFAULT 10 NOT NULL,
  send_delay_ms integer DEFAULT 200 NOT NULL,
  auth_email_ttl_minutes integer DEFAULT 15 NOT NULL,
  transactional_email_ttl_minutes integer DEFAULT 60 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.email_unsubscribe_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  used_at timestamp with time zone
);

CREATE TABLE public.emotional_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_id uuid NOT NULL,
  center_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  record_date date DEFAULT CURRENT_DATE NOT NULL,
  primary_emotion text NOT NULL,
  secondary_emotion text NOT NULL,
  detailed_emotion text,
  intensity integer NOT NULL,
  note text,
  context text,
  thought text,
  reaction text,
  need text,
  helpful_action text
);

CREATE TABLE public.expense_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#64748B'::text NOT NULL,
  icon text,
  is_professional_payment_category boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  display_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expense_recurring_templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  category_id uuid NOT NULL,
  supplier_id uuid,
  description text NOT NULL,
  default_amount numeric(10,2) NOT NULL,
  frequency expense_recurrence_frequency DEFAULT 'monthly'::expense_recurrence_frequency NOT NULL,
  day_of_period smallint DEFAULT 1 NOT NULL,
  anchor_month smallint,
  is_active boolean DEFAULT true NOT NULL,
  starts_on date DEFAULT CURRENT_DATE NOT NULL,
  ends_on date,
  default_payment_method text,
  vat_rate numeric(5,2),
  irpf_rate numeric(5,2),
  last_generated_period date,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.expenses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  kind expense_kind DEFAULT 'variable'::expense_kind NOT NULL,
  category_id uuid NOT NULL,
  supplier_id uuid,
  professional_id uuid,
  compensation_agreement_id uuid,
  compensation_period_start date,
  compensation_period_end date,
  recurring_template_id uuid,
  generated_period_start date,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  tax_base numeric(10,2),
  vat_rate numeric(5,2),
  vat_amount numeric(10,2),
  irpf_rate numeric(5,2),
  irpf_amount numeric(10,2),
  supplier_invoice_number text,
  invoice_issue_date date,
  operation_date date,
  expense_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  status expense_status DEFAULT 'pending'::expense_status NOT NULL,
  payment_method text,
  paid_at date,
  paid_amount numeric(10,2) DEFAULT 0 NOT NULL,
  attachment_path text,
  attachment_mime_type text,
  ai_extraction_status text,
  ai_extraction_raw jsonb,
  ai_extraction_confidence numeric(3,2),
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  drive_file_id text,
  drive_url text
);

CREATE TABLE public.google_calendar_channels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  channel_id text NOT NULL,
  resource_id text NOT NULL,
  calendar_id text NOT NULL,
  expiration timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.google_session_sync_state (
  session_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  google_event_id text NOT NULL,
  baseline_date date NOT NULL,
  baseline_start time without time zone NOT NULL,
  baseline_end time without time zone NOT NULL,
  google_etag text,
  google_updated_at timestamp with time zone,
  status text DEFAULT 'synced'::text NOT NULL,
  conflict_payload jsonb,
  last_synced_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.google_sync_debounce (
  professional_id uuid NOT NULL,
  calendar_id text,
  last_webhook_at timestamp with time zone DEFAULT now() NOT NULL,
  last_sync_trigger_at timestamp with time zone,
  pending boolean DEFAULT true NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.google_sync_locks (
  professional_id uuid NOT NULL,
  lock_token uuid NOT NULL,
  locked_until timestamp with time zone NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.integration_errors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  provider text DEFAULT 'google'::text NOT NULL,
  source text NOT NULL,
  step text,
  at timestamp with time zone DEFAULT now() NOT NULL,
  http_status integer,
  error_code text,
  message text,
  raw jsonb,
  correlation_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_correction_operations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  original_invoice_id uuid NOT NULL,
  resulting_invoice_id uuid,
  operation_type text NOT NULL,
  idempotency_key uuid NOT NULL,
  status text DEFAULT 'preparing'::text NOT NULL,
  requested_by uuid,
  error_code text,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  session_id uuid,
  description text NOT NULL,
  quantity integer DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  total numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tax_rate numeric DEFAULT 0,
  tax_name text DEFAULT 'IVA'::text,
  tax_amount numeric DEFAULT 0,
  retention_rate numeric DEFAULT 0,
  retention_name text DEFAULT 'IRPF'::text,
  retention_amount numeric DEFAULT 0,
  billable_event_id uuid,
  bono_id uuid
);

CREATE TABLE public.invoice_series (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  format text DEFAULT '{SERIE}-{AAAA}-{NNNNN}'::text NOT NULL,
  series_type text DEFAULT 'ordinary'::text NOT NULL,
  invoice_type text DEFAULT 'complete'::text NOT NULL,
  next_number integer DEFAULT 1 NOT NULL,
  is_default boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_substitutions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  replacement_invoice_id uuid NOT NULL,
  substituted_invoice_id uuid NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  invoice_number text NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date,
  subtotal numeric(10,2) DEFAULT 0 NOT NULL,
  tax_rate numeric(5,2) DEFAULT 21,
  tax_amount numeric(10,2) DEFAULT 0,
  total numeric(10,2) DEFAULT 0 NOT NULL,
  status invoice_status DEFAULT 'draft'::invoice_status,
  is_recapitulative boolean DEFAULT false,
  verifactu_hash text,
  verifactu_timestamp timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  retention_rate numeric DEFAULT 0,
  retention_amount numeric DEFAULT 0,
  invoice_hash text,
  previous_invoice_hash text,
  verifactu_qr text,
  verifactu_registration_id text,
  series_id uuid,
  rectified_invoice_id uuid,
  rectification_type text,
  verifactu_pending boolean DEFAULT false,
  verifactu_retry_count integer DEFAULT 0,
  rectification_reason_code text,
  base_rectificada numeric,
  cuota_rectificada numeric,
  cuota_recargo_rectificado numeric,
  is_valid boolean DEFAULT true NOT NULL,
  access_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text),
  verifactu_error_permanent boolean DEFAULT false,
  verifactu_error_message text,
  verifactu_invoice_type text,
  operation_date date,
  recipient_snapshot jsonb,
  correction_operation_id uuid,
  cancellation_date date,
  cancellation_reason text,
  invoice_type text,
  pdf_generated_at timestamp with time zone,
  drive_file_id text,
  drive_url text
);

CREATE TABLE public.location_schedules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  location_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  start_time time without time zone DEFAULT '09:00:00'::time without time zone NOT NULL,
  end_time time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
  is_open boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_default boolean DEFAULT false NOT NULL
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid,
  session_id uuid,
  type notification_type NOT NULL,
  status notification_status DEFAULT 'pending'::notification_status,
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  scheduled_for timestamp with time zone,
  sent_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  meta_message_id text,
  purpose text
);

CREATE TABLE public.oauth_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  provider text NOT NULL,
  access_token text,
  refresh_token text,
  expires_at timestamp with time zone,
  scope text,
  provider_account_id text,
  stripe_account_id text,
  stripe_account_status text,
  google_calendar_id text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  sync_token text,
  watch_channel_id text,
  watch_resource_id text,
  watch_expires_at timestamp with time zone,
  last_sync_at timestamp with time zone,
  last_sync_status text,
  needs_reconnect boolean DEFAULT false,
  watch_channel_token text,
  consecutive_sync_errors integer DEFAULT 0,
  last_sync_error_code text,
  last_sync_error_message text,
  last_sync_error_raw jsonb,
  last_token_refresh_at timestamp with time zone,
  last_token_refresh_result text,
  last_webhook_received_at timestamp with time zone,
  sync_token_last_set_at timestamp with time zone
);

CREATE TABLE public.patient_custom_price_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_custom_price_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  center_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  old_price numeric(10,2),
  new_price numeric(10,2) NOT NULL,
  old_start_date date,
  new_start_date date NOT NULL,
  old_end_date date,
  new_end_date date,
  change_type text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_custom_prices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  custom_price numeric(10,2) NOT NULL,
  start_date date DEFAULT CURRENT_DATE NOT NULL,
  end_date date,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_magic_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_id uuid,
  email text NOT NULL,
  center_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.patient_payment_methods (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  professional_id uuid,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  connected_account_id text NOT NULL,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  mandate_policy_version_id uuid,
  mandate_accepted_at timestamp with time zone,
  mandate_ip text,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_portal_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_id uuid NOT NULL,
  user_id uuid,
  email text NOT NULL,
  is_active boolean DEFAULT true,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_portal_otp_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  patient_id uuid NOT NULL,
  center_id uuid NOT NULL,
  code_hash text NOT NULL,
  channel text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  failed_attempts integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_report_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  session_id uuid,
  ai_generated_document_id uuid,
  title text DEFAULT 'Resumen de tu sesión'::text NOT NULL,
  content_markdown text NOT NULL,
  access_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patient_tariff_plan_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  tariff_plan_id uuid NOT NULL,
  start_date date DEFAULT CURRENT_DATE NOT NULL,
  end_date date,
  is_active boolean DEFAULT true NOT NULL,
  notes text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.patients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  assigned_professional_id uuid,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text,
  phone text,
  date_of_birth date,
  gender text,
  address text,
  city text,
  postal_code text,
  tax_id text,
  emergency_contact_name text,
  emergency_contact_phone text,
  notes text,
  status patient_status DEFAULT 'active'::patient_status,
  is_minor boolean DEFAULT false,
  guardian_name text,
  guardian_phone text,
  guardian_email text,
  guardian_relationship text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  status_source text DEFAULT 'auto'::text,
  status_reason text,
  status_updated_at timestamp with time zone DEFAULT now(),
  auto_invoice_on_complete boolean DEFAULT false NOT NULL,
  payment_mode text,
  require_advance_payment_always boolean DEFAULT false,
  cancellation_policy_enabled boolean DEFAULT true NOT NULL,
  preferred_invoice_type text DEFAULT 'simplified'::text NOT NULL
);

CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  invoice_id uuid,
  patient_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  payment_method text DEFAULT 'cash'::text,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  reference text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  session_id uuid,
  status payment_status DEFAULT 'paid'::payment_status NOT NULL,
  refunded_amount numeric(10,2) DEFAULT 0 NOT NULL,
  refunded_at timestamp with time zone,
  stripe_charge_id text
);

CREATE TABLE public.plaud_oauth_states (
  state text NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid,
  client_id text NOT NULL,
  code_verifier_encrypted text NOT NULL,
  redirect_uri text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '00:15:00'::interval) NOT NULL
);

CREATE TABLE public.plaud_recordings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  plaud_file_id text NOT NULL,
  start_at timestamp with time zone NOT NULL,
  duration_ms bigint NOT NULL,
  serial_number text,
  status text DEFAULT 'pending'::text NOT NULL,
  contains_multiple_sessions boolean DEFAULT false NOT NULL,
  segmentation_score numeric,
  segmentation_signals jsonb,
  segment_boundaries jsonb,
  overlap_flag boolean DEFAULT false NOT NULL,
  overlap_with_file_id text,
  session_id uuid,
  patient_id uuid,
  match_confidence numeric,
  match_reasons jsonb,
  matched_by text,
  confirmed_by uuid,
  confirmed_at timestamp with time zone,
  transcript_text text,
  transcript_fetched_at timestamp with time zone,
  transcript_expires_at timestamp with time zone,
  report_generated_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  transcript_attempts integer DEFAULT 0 NOT NULL,
  transcript_retry_gave_up_at timestamp with time zone,
  segmentation_unverified boolean DEFAULT false NOT NULL,
  flagged_after_confirmation boolean DEFAULT false NOT NULL
);

CREATE TABLE public.portal_intake_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  request_type text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  modality text,
  city text,
  notes text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  privacy_accepted boolean DEFAULT false NOT NULL,
  privacy_accepted_at timestamp with time zone,
  privacy_policy_url text,
  specialty text,
  referral_context jsonb,
  recommended_partner_ids uuid[],
  selected_partner_id uuid,
  handled_by uuid,
  handled_at timestamp with time zone,
  internal_notes text
);

CREATE TABLE public.professional_compensation_agreements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  compensation_type compensation_type DEFAULT 'fixed'::compensation_type NOT NULL,
  fixed_amount numeric(10,2) DEFAULT 0 NOT NULL,
  percentage_rate numeric(5,2) DEFAULT 0 NOT NULL,
  compensation_basis compensation_basis DEFAULT 'collected_payments'::compensation_basis NOT NULL,
  default_irpf_rate numeric(5,2),
  category_id uuid,
  is_active boolean DEFAULT true NOT NULL,
  effective_from date DEFAULT CURRENT_DATE NOT NULL,
  effective_to date,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.professional_integrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  whatsapp_enabled boolean DEFAULT false,
  whatsapp_send_method text DEFAULT 'web'::text,
  whatsapp_access_token text,
  whatsapp_phone_number_id text,
  whatsapp_business_account_id text,
  zoom_enabled boolean DEFAULT false,
  google_meet_enabled boolean DEFAULT false,
  default_video_provider text DEFAULT 'none'::text,
  google_calendar_enabled boolean DEFAULT false,
  google_calendar_sync_mode text DEFAULT 'one_way'::text,
  stripe_enabled boolean DEFAULT false,
  stripe_payment_mode text DEFAULT 'post_session'::text,
  stripe_scheduled_hours_before integer DEFAULT 24,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_google_sync_at timestamp with time zone,
  google_event_title_format text DEFAULT '{nombre}'::text,
  google_event_description_format text DEFAULT 'Profesional: {profesional}
Tipo: {tipo}
Notas: {notas}'::text,
  google_sync_days_past integer DEFAULT 30,
  google_sync_days_future integer DEFAULT 90,
  google_calendar_conflict_mode text DEFAULT 'psycma_wins'::text NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  center_id uuid,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  specialty text,
  license_number text,
  commission_rate numeric(5,2) DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.public_short_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  center_id uuid NOT NULL,
  target_type text NOT NULL,
  target_token text NOT NULL,
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  access_count integer DEFAULT 0 NOT NULL,
  last_accessed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.rate_limit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ip text NOT NULL,
  action text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.recurring_series (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  created_by uuid NOT NULL,
  patient_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  base_start_datetime timestamp with time zone NOT NULL,
  duration_minutes integer DEFAULT 60 NOT NULL,
  timezone text DEFAULT 'Europe/Madrid'::text NOT NULL,
  session_type text,
  price numeric DEFAULT 0 NOT NULL,
  session_modality text DEFAULT 'in_person'::text,
  location_id uuid,
  cancellation_policy text DEFAULT '24_hours'::text,
  notes_default text,
  bono_id uuid,
  rrule_json jsonb NOT NULL,
  max_occurrences integer DEFAULT 50,
  last_generated_until date,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.referral_partner_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  surname text,
  email text NOT NULL,
  phone text,
  website text,
  description text,
  public_name text,
  modality text[] DEFAULT '{}'::text[] NOT NULL,
  provinces text[],
  cities text[],
  specialties text[],
  status text DEFAULT 'pending'::text NOT NULL,
  privacy_accepted boolean DEFAULT false NOT NULL,
  privacy_accepted_at timestamp with time zone,
  privacy_policy_url text,
  handled_by uuid,
  handled_at timestamp with time zone,
  rejection_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referral_partners (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  active boolean DEFAULT true NOT NULL,
  name text NOT NULL,
  surname text,
  public_name text,
  email text,
  phone text,
  website text,
  modality text[] DEFAULT '{}'::text[] NOT NULL,
  provinces text[],
  cities text[],
  specialties text[],
  description text,
  priority integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.referral_specialties (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  priority integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.schedule_exceptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid,
  scope schedule_exception_scope DEFAULT 'center'::schedule_exception_scope NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  all_day boolean DEFAULT true NOT NULL,
  start_time time without time zone,
  end_time time without time zone,
  reason_type schedule_exception_reason DEFAULT 'other'::schedule_exception_reason NOT NULL,
  reason_label text,
  notes text,
  affects_booking boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.session_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  default_price numeric DEFAULT 60 NOT NULL,
  commission_rate numeric DEFAULT 0,
  duration_minutes integer DEFAULT 60 NOT NULL,
  color text DEFAULT '#3B82F6'::text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  tax_treatment text DEFAULT 'EXENTA'::text,
  vat_rate numeric DEFAULT 0,
  exemption_code text DEFAULT 'E1'::text,
  non_subject_code text,
  vat_regime_key text DEFAULT '01'::text,
  is_public boolean DEFAULT true,
  display_order integer DEFAULT 0,
  is_first_consultation boolean DEFAULT false
);

CREATE TABLE public.sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  bono_id uuid,
  session_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  session_type text DEFAULT 'individual'::text,
  status session_status DEFAULT 'scheduled'::session_status,
  price numeric(10,2) DEFAULT 0 NOT NULL,
  notes text,
  cancellation_reason text,
  send_reminder_email boolean DEFAULT true,
  send_reminder_sms boolean DEFAULT false,
  send_reminder_whatsapp boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  room text,
  session_modality text DEFAULT 'in_person'::text,
  video_call_link text,
  cancellation_policy text DEFAULT '24_hours'::text,
  location_id uuid,
  access_token text,
  video_provider text,
  google_calendar_event_id text,
  stripe_payment_status text,
  stripe_checkout_session_id text,
  stripe_payment_mode text,
  payment_mode text,
  payment_status text DEFAULT 'pending'::text,
  payment_reminder_count integer DEFAULT 0,
  last_payment_reminder_at timestamp with time zone,
  reminder_sent_at timestamp with time zone,
  recurring_series_id uuid,
  occurrence_index integer,
  is_exception boolean DEFAULT false,
  original_start_datetime timestamp with time zone,
  zoom_meeting_id text,
  zoom_password text,
  ai_summary_clinical text,
  ai_summary_patient text,
  transcript_processed_at timestamp with time zone,
  session_type_id uuid,
  base_price_snapshot numeric(10,2),
  pricing_source text,
  custom_price_id uuid,
  tariff_plan_id_snapshot uuid,
  tariff_plan_assignment_id_snapshot uuid,
  advance_payment_limit_hours integer,
  advance_payment_due_at timestamp with time zone,
  advance_payment_notification_sent_at timestamp with time zone,
  advance_payment_notification_failed_at timestamp with time zone,
  advance_payment_notification_error text,
  cancelled_for_non_payment boolean DEFAULT false,
  cancellation_origin text,
  cancellation_policy_version_id uuid,
  cancellation_policy_status text,
  stripe_payment_confirmation_sent_at timestamp with time zone,
  advance_payment_send_at timestamp with time zone
);

CREATE TABLE public.special_day_slots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  special_day_id uuid NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.special_days (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid,
  scope special_day_scope NOT NULL,
  type special_day_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  label text,
  notes text,
  affects_public_booking boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.stripe_webhook_events (
  event_id text NOT NULL,
  event_type text NOT NULL,
  connected_account_id text,
  status text NOT NULL,
  attempts integer DEFAULT 1 NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  processed_at timestamp with time zone
);

CREATE TABLE public.suppliers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  tax_id text,
  address text,
  city text,
  postal_code text,
  province text,
  country text DEFAULT 'España'::text,
  email text,
  phone text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.suppressed_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tariff_plan_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tariff_plan_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  price numeric(10,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tariff_plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_default boolean DEFAULT false NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  center_id uuid NOT NULL
);

CREATE TABLE public.verifactu_chain_status (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  nif_emisor text NOT NULL,
  id_sistema_informatico text NOT NULL,
  numero_instalacion integer NOT NULL,
  ultimo_hash text NOT NULL,
  ultima_factura_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  locked_at timestamp with time zone,
  locked_by text,
  ultima_verifactu_record_id uuid
);

CREATE TABLE public.verifactu_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid,
  center_id uuid NOT NULL,
  event_type text NOT NULL,
  aeat_csv text,
  aeat_response_code text,
  aeat_response_message text,
  aeat_response_xml text,
  xml_sent text,
  environment text,
  http_status integer,
  error_details text,
  retry_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.verifactu_records (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  previous_record_id uuid,
  record_type text NOT NULL,
  taxpayer_nif text NOT NULL,
  system_id text NOT NULL,
  installation_id integer NOT NULL,
  environment text NOT NULL,
  invoice_number text NOT NULL,
  invoice_issue_date date NOT NULL,
  hash text NOT NULL,
  previous_hash text,
  xml_sent text NOT NULL,
  aeat_response_xml text,
  aeat_status text NOT NULL,
  aeat_csv text,
  http_status integer,
  error_message text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.whatsapp_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  session_id uuid,
  phone text NOT NULL,
  content text,
  type text DEFAULT 'text'::text NOT NULL,
  direction text DEFAULT 'outgoing'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  wasender_message_id text,
  media_url text,
  caption text,
  template_name text,
  template_variables jsonb,
  error_message text,
  retry_count integer DEFAULT 0,
  metadata jsonb,
  sent_at timestamp with time zone,
  delivered_at timestamp with time zone,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  message_type text DEFAULT 'manual'::text,
  patient_id uuid,
  meta_message_id text
);

CREATE TABLE public.whatsapp_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  message_id uuid,
  session_id uuid,
  priority integer DEFAULT 0,
  scheduled_at timestamp with time zone DEFAULT now() NOT NULL,
  processing_started_at timestamp with time zone,
  processed_at timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  next_retry_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.whatsapp_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  wasender_session_id text,
  name text DEFAULT 'Principal'::text NOT NULL,
  status text DEFAULT 'disconnected'::text NOT NULL,
  phone_number text,
  qr_code text,
  qr_expires_at timestamp with time zone,
  last_connected_at timestamp with time zone,
  last_error text,
  webhook_secret text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  api_key text
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role_in_center(
    _user_id,
    _role,
    public.get_user_center_id(_user_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role_in_center(
    _user_id,
    'admin'::public.app_role,
    public.get_user_center_id(_user_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_professional(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_role_in_center(
    _user_id,
    'professional'::public.app_role,
    public.get_user_center_id(_user_id)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_center_id(_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT center_id FROM public.profiles WHERE id = _user_id
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data ->> 'first_name',
        NEW.raw_user_meta_data ->> 'last_name'
    );
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.user_can_create_center(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Allow if user doesn't have a center assigned yet
  -- (either no profile exists, or profile has NULL center_id)
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = _user_id 
    AND center_id IS NOT NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) - 'updated_at';
    v_new := to_jsonb(NEW) - 'updated_at';
    -- Skip no-op updates (only updated_at changed, or nothing changed)
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, old_values, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, old_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_session_access_token()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.access_token IS NULL THEN
    -- Use explicit schema reference to extensions.gen_random_bytes
    NEW.access_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_signed_invoice_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Si la factura tiene hash (está firmada), solo permitir cambios específicos
  IF OLD.invoice_hash IS NOT NULL THEN
    -- Permitir solo cambio de estado a cancelled (anulación)
    -- y actualización de campos Verifactu
    IF (
      NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled'
    ) OR (
      -- Permitir actualizar campos verifactu durante el proceso de firma
      NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash OR
      NEW.verifactu_hash IS DISTINCT FROM OLD.verifactu_hash OR
      NEW.verifactu_qr IS DISTINCT FROM OLD.verifactu_qr OR
      NEW.verifactu_timestamp IS DISTINCT FROM OLD.verifactu_timestamp OR
      NEW.verifactu_registration_id IS DISTINCT FROM OLD.verifactu_registration_id OR
      NEW.previous_invoice_hash IS DISTINCT FROM OLD.previous_invoice_hash
    ) THEN
      -- Estos cambios están permitidos
      RETURN NEW;
    END IF;

    -- Permitir reasignación de patient_id (merge) si no cambian campos financieros
    IF (
      NEW.patient_id IS DISTINCT FROM OLD.patient_id AND
      NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number AND
      NEW.issue_date IS NOT DISTINCT FROM OLD.issue_date AND
      NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal AND
      NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount AND
      NEW.total IS NOT DISTINCT FROM OLD.total
    ) THEN
      RETURN NEW;
    END IF;

    -- Verificar que no se modifiquen campos críticos
    IF (
      NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
      NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
      NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
      NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
      NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
      NEW.total IS DISTINCT FROM OLD.total
    ) THEN
      RAISE EXCEPTION 'No se puede modificar una factura firmada con Verifactu. Solo se permite anular la factura.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_session_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-session-token', '')
$function$
;

CREATE OR REPLACE FUNCTION public.verify_session_token_for_patient(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_session_token_for_professional(professional_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND professional_id = professional_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_session_token_for_location(location_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND location_id = location_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.get_portal_center(p_slug text)
 RETURNS TABLE(id uuid, name text, portal_slug text, portal_enabled boolean, portal_require_approval boolean, portal_allow_professional_selection boolean, portal_default_professional_id uuid, reschedule_max_days integer, reschedule_slot_duration integer, reschedule_require_confirmation boolean, city text, province text, country text, logo_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    c.id,
    c.name,
    c.portal_slug,
    c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.reschedule_max_days,
    c.reschedule_slot_duration,
    c.reschedule_require_confirmation,
    c.city,
    c.province,
    c.country,
    c.logo_url
  FROM centers c
  WHERE c.portal_enabled = true 
    AND c.portal_slug IS NOT NULL
    AND c.portal_slug = p_slug
$function$
;

CREATE OR REPLACE FUNCTION public.get_center_address_for_session_token()
 RETURNS TABLE(center_name text, center_address text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.name AS center_name,
    NULLIF(
      trim(both ', ' from concat_ws(
        ', ',
        NULLIF(trim(concat_ws(' ', c.address, c.address_details)), ''),
        NULLIF(trim(c.city), ''),
        NULLIF(trim(c.postal_code), '')
      )),
      ''
    ) AS center_address
  FROM public.sessions s
  JOIN public.centers c ON c.id = s.center_id
  WHERE s.access_token = public.get_session_token()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_session_token_for_center(center_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND center_id = center_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.get_invoice_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-invoice-token', '')
$function$
;

CREATE OR REPLACE FUNCTION public.verify_invoice_token_for_center(center_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE access_token = public.get_invoice_token()
    AND center_id = center_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.update_calendar_events_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono record;
  v_session_center_id uuid;
  v_inserted boolean := false;
  v_debt_deleted boolean := false;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT * INTO v_bono FROM public.bonos
  WHERE id = p_bono_id AND center_id = v_user_center_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no existe o no pertenece a tu centro';
  END IF;

  SELECT center_id INTO v_session_center_id FROM public.sessions WHERE id = p_session_id;
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono.status IS NOT NULL AND v_bono.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Bono no está activo';
  END IF;

  IF COALESCE(v_bono.used_sessions, 0) >= COALESCE(v_bono.total_sessions, 0) THEN
    RAISE EXCEPTION 'Bono sin sesiones disponibles';
  END IF;

  BEGIN
    INSERT INTO public.bono_items (bono_id, session_id, created_at)
    VALUES (p_bono_id, p_session_id, now());
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  UPDATE public.sessions
  SET bono_id = p_bono_id, price = 0, payment_status = 'paid', updated_at = now()
  WHERE id = p_session_id;

  DELETE FROM public.debts
  WHERE session_id = p_session_id
    AND (paid_amount IS NULL OR paid_amount = 0)
    AND invoice_id IS NULL;
  IF FOUND THEN
    v_debt_deleted := true;
  ELSE
    UPDATE public.debts
    SET amount = 0, status = 'paid',
        notes = COALESCE(notes, '') || ' (Cubierto por bono)', updated_at = now()
    WHERE session_id = p_session_id AND status != 'paid';
  END IF;

  -- FIX: billing_status check constraint only allows 'pending' or 'settled'
  UPDATE public.billable_events
  SET amount = 0, billing_status = 'settled', updated_at = now()
  WHERE session_id = p_session_id;

  IF v_inserted THEN
    UPDATE public.bonos
    SET used_sessions = COALESCE(used_sessions, 0) + 1, updated_at = now()
    WHERE id = p_bono_id;

    UPDATE public.bonos
    SET status = CASE
      WHEN COALESCE(used_sessions, 0) >= COALESCE(total_sessions, 0) THEN 'exhausted'
      ELSE status
    END
    WHERE id = p_bono_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'debt_deleted', v_debt_deleted);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_bono_from_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_session_center_id uuid;
  v_bono_id uuid;
  v_deleted boolean := false;
  v_default_price numeric;
  v_session_type text;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- SECURITY CHECK: Verify session belongs to caller's center
  SELECT center_id, bono_id, session_type INTO v_session_center_id, v_bono_id, v_session_type
  FROM public.sessions
  WHERE id = p_session_id;
  
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', false, 'reason', 'no_bono_linked');
  END IF;

  -- Delete consumption row if exists
  DELETE FROM public.bono_items
  WHERE session_id = p_session_id AND bono_id = v_bono_id
  RETURNING true INTO v_deleted;

  -- Lookup default price from session_types (case-insensitive)
  SELECT default_price INTO v_default_price
  FROM public.session_types
  WHERE center_id = v_session_center_id
    AND LOWER(name) = LOWER(v_session_type)
  LIMIT 1;

  -- Unlink session and restore price
  UPDATE public.sessions
  SET bono_id = NULL,
      price = COALESCE(v_default_price, price),
      payment_status = CASE WHEN v_default_price IS NOT NULL AND v_default_price > 0 THEN 'pending' ELSE payment_status END,
      updated_at = now()
  WHERE id = p_session_id;

  -- Decrement only if we actually deleted a consumption row
  IF v_deleted THEN
    UPDATE public.bonos
    SET used_sessions = GREATEST(COALESCE(used_sessions, 0) - 1, 0),
        status = 'active',
        updated_at = now()
    WHERE id = v_bono_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted, 'restored_price', COALESCE(v_default_price, 0));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_debt_center_id uuid;
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_paid_sum numeric;
  v_new_status text;
  v_invoice_status text;
  v_session_id uuid;
  v_result jsonb;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  SELECT center_id, invoice_id, session_id INTO v_debt_center_id, v_invoice_id, v_session_id
  FROM debts
  WHERE id = p_debt_id;
  
  IF v_debt_center_id IS NULL OR v_debt_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Debt not found or does not belong to your center';
  END IF;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Debt % has no invoice_id', p_debt_id;
  END IF;

  SELECT total, status INTO v_invoice_total, v_invoice_status
  FROM invoices
  WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
  FROM payments
  WHERE invoice_id = v_invoice_id;

  IF v_paid_sum >= v_invoice_total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET 
    paid_amount = v_paid_sum,
    status = v_new_status::payment_status,
    updated_at = now()
  WHERE id = p_debt_id;

  -- Sync invoice status
  IF v_new_status = 'paid' AND v_invoice_status IN ('issued', 'partial') THEN
    UPDATE invoices SET status = 'paid', updated_at = now() WHERE id = v_invoice_id;
  ELSIF v_new_status != 'paid' AND v_invoice_status = 'paid' THEN
    UPDATE invoices SET status = 'issued', updated_at = now() WHERE id = v_invoice_id;
  END IF;

  -- Auto-complete past session when debt is fully paid
  IF v_new_status = 'paid' AND v_session_id IS NOT NULL THEN
    UPDATE sessions
    SET status = 'completed', updated_at = now()
    WHERE id = v_session_id
      AND status IN ('scheduled', 'confirmed')
      AND session_date < CURRENT_DATE;
  END IF;

  v_result := jsonb_build_object(
    'debt_id', p_debt_id,
    'invoice_id', v_invoice_id,
    'invoice_total', v_invoice_total,
    'paid_amount', v_paid_sum,
    'status', v_new_status
  );

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_debt_id_for_payment_by_invoice(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_debt_id uuid;
BEGIN
  SELECT * INTO p
  FROM public.payments
  WHERE id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF p.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Payment % has no invoice_id', p_payment_id;
  END IF;

  SELECT d.id INTO v_debt_id
  FROM public.debts d
  WHERE d.invoice_id = p.invoice_id
    AND d.center_id = p.center_id
    AND d.patient_id = p.patient_id
  ORDER BY d.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_debt_id IS NULL THEN
    RAISE EXCEPTION 'No debt found for payment % (invoice_id=%)', p_payment_id, p.invoice_id;
  END IF;

  RETURN v_debt_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_payment_and_recompute_debt_v2(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT center_id INTO v_payment_center_id FROM payments WHERE id = p_payment_id;
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.find_debt_id_for_payment(p_payment_id);

  DELETE FROM public.payments WHERE id = p_payment_id;

  IF v_debt_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'debt_updated', false);
  END IF;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_payment_and_recompute_debt_v2(p_payment_id uuid, p_amount numeric, p_payment_date timestamp with time zone, p_payment_method text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  SELECT center_id INTO v_payment_center_id FROM payments WHERE id = p_payment_id;
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.find_debt_id_for_payment(p_payment_id);

  UPDATE public.payments
  SET amount = p_amount,
      payment_date = p_payment_date,
      payment_method = p_payment_method,
      reference = p_reference,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_payment_id;

  IF v_debt_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'debt_updated', false);
  END IF;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.convert_calendar_event_to_session(p_calendar_event_id uuid, p_patient_id uuid, p_session_type text, p_price numeric, p_session_modality text DEFAULT 'in_person'::text, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_bono_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_session_id uuid;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_center_id uuid;
BEGIN
  -- Lock and get the calendar event
  SELECT * INTO v_event FROM public.calendar_events 
  WHERE id = p_calendar_event_id AND is_converted = false
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento no encontrado o ya convertido';
  END IF;
  
  -- Get center_id from professional's profile
  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_event.professional_id;
  
  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el centro del profesional';
  END IF;
  
  -- Extract date and times from the event (in Europe/Madrid timezone)
  v_session_date := DATE(v_event.start_at AT TIME ZONE 'Europe/Madrid');
  v_start_time := (v_event.start_at AT TIME ZONE 'Europe/Madrid')::time;
  v_end_time := (v_event.end_at AT TIME ZONE 'Europe/Madrid')::time;
  
  -- Create the session
  INSERT INTO public.sessions (
    center_id,
    patient_id, 
    professional_id, 
    session_date, 
    start_time, 
    end_time,
    session_type, 
    price, 
    status, 
    session_modality, 
    location_id, 
    notes, 
    bono_id,
    google_calendar_event_id
  ) VALUES (
    v_center_id,
    p_patient_id, 
    v_event.professional_id, 
    v_session_date, 
    v_start_time, 
    v_end_time,
    p_session_type, 
    p_price, 
    'scheduled', 
    p_session_modality, 
    p_location_id, 
    COALESCE(p_notes, 'Convertido desde: ' || COALESCE(v_event.summary, 'Evento externo')),
    p_bono_id, 
    v_event.google_event_id
  ) RETURNING id INTO v_session_id;
  
  -- Mark the calendar event as converted
  UPDATE public.calendar_events SET
    is_converted = true,
    converted_session_id = v_session_id,
    converted_at = now()
  WHERE id = p_calendar_event_id;
  
  RETURN v_session_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role_in_center(_user_id uuid, _role app_role, _center_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND center_id = _center_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.portal_list_professionals(_portal_slug text)
 RETURNS TABLE(id uuid, first_name text, last_name text, specialty text, avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.first_name, p.last_name, p.specialty, p.avatar_url
  FROM public.profiles p
  JOIN public.centers c ON c.id = p.center_id
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.center_id = c.id
  WHERE c.portal_enabled = true
    AND c.portal_slug = _portal_slug
    AND p.is_active = true
    AND ur.role IN ('professional'::public.app_role, 'admin'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION public.bootstrap_create_center(p_name text, p_tax_id text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_can_create_center(v_user_id) THEN
    RAISE EXCEPTION 'User already has a center';
  END IF;

  INSERT INTO public.centers (
    name, tax_id, address, city, postal_code, phone, email
  ) VALUES (
    p_name,
    NULLIF(p_tax_id, ''),
    NULLIF(p_address, ''),
    NULLIF(p_city, ''),
    NULLIF(p_postal_code, ''),
    NULLIF(p_phone, ''),
    NULLIF(p_email, '')
  )
  RETURNING id INTO v_center_id;

  UPDATE public.profiles
  SET center_id = v_center_id,
      updated_at = now()
  WHERE id = v_user_id;

  INSERT INTO public.user_roles (user_id, center_id, role)
  VALUES
    (v_user_id, v_center_id, 'admin'::public.app_role),
    (v_user_id, v_center_id, 'professional'::public.app_role)
  ON CONFLICT (user_id, center_id, role) DO NOTHING;

  RETURN v_center_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_consent_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-consent-token', '')
$function$
;

CREATE OR REPLACE FUNCTION public.verify_consent_token(consent_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND id = consent_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_patient(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_template(template_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND template_id = template_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_professional(professional_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND professional_id = professional_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_center(center_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND center_id = center_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.delete_bono_safely(p_bono_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono RECORD;
  v_result jsonb;
  v_affected_sessions int;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated or no center assigned'
    );
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions: requires professional or admin role'
    );
  END IF;

  -- Lock bono and verify center ownership
  SELECT id, name, total_sessions, used_sessions, status, patient_id, center_id
  INTO v_bono
  FROM bonos
  WHERE id = p_bono_id AND center_id = v_user_center_id
  FOR UPDATE;

  IF v_bono.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bono no encontrado o no pertenece a tu centro'
    );
  END IF;

  IF v_bono.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El bono ya está cancelado'
    );
  END IF;

  -- Case 1: No sessions consumed - physical deletion
  IF v_bono.used_sessions = 0 OR v_bono.used_sessions IS NULL THEN
    UPDATE sessions 
    SET bono_id = NULL, updated_at = now()
    WHERE bono_id = p_bono_id;
    
    GET DIAGNOSTICS v_affected_sessions = ROW_COUNT;

    DELETE FROM bono_items WHERE bono_id = p_bono_id;
    DELETE FROM bonos WHERE id = p_bono_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'deleted',
      'message', 'Bono eliminado permanentemente',
      'bono_name', v_bono.name,
      'sessions_unlinked', v_affected_sessions
    );

  -- Case 2: With consumed sessions - soft delete
  ELSE
    UPDATE bonos 
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_bono_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'cancelled',
      'message', 'Bono cancelado (mantiene historial)',
      'bono_name', v_bono.name,
      'used_sessions', v_bono.used_sessions,
      'total_sessions', v_bono.total_sessions
    );
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_bono_sessions(p_bono_id uuid)
 RETURNS TABLE(session_id uuid, session_date date, session_status text, patient_name text, professional_name text, session_type_name text, consumes_bono boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono_center_id uuid;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  -- SECURITY CHECK: Verify bono belongs to caller's center
  SELECT center_id INTO v_bono_center_id
  FROM bonos
  WHERE id = p_bono_id;
  
  IF v_bono_center_id IS NULL OR v_bono_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Bono no encontrado o no pertenece a tu centro';
  END IF;

  RETURN QUERY
  SELECT 
    s.id as session_id,
    s.session_date as session_date,
    s.status::text as session_status,
    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
    CONCAT(pr.first_name, ' ', pr.last_name) as professional_name,
    s.session_type as session_type_name,
    EXISTS(SELECT 1 FROM bono_items bi WHERE bi.bono_id = p_bono_id AND bi.session_id = s.id) as consumes_bono
  FROM sessions s
  LEFT JOIN patients p ON s.patient_id = p.id
  LEFT JOIN profiles pr ON s.professional_id = pr.id
  WHERE s.bono_id = p_bono_id
     OR EXISTS(SELECT 1 FROM bono_items bi WHERE bi.bono_id = p_bono_id AND bi.session_id = s.id)
  ORDER BY s.session_date DESC, s.start_time DESC;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_single_online_location()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.location_type = 'online' AND NEW.is_active = true THEN
    IF EXISTS (
      SELECT 1 FROM center_locations 
      WHERE center_id = NEW.center_id 
      AND location_type = 'online' 
      AND is_active = true
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Solo puede existir una ubicación ONLINE activa por centro';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.portal_list_locations(p_center_slug text, p_location_type location_type_enum DEFAULT NULL::location_type_enum)
 RETURNS TABLE(id uuid, name text, location_type location_type_enum, street text, city text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    cl.id,
    cl.name,
    cl.location_type,
    cl.street,
    cl.city
  FROM center_locations cl
  JOIN centers c ON c.id = cl.center_id
  WHERE c.portal_slug = p_center_slug
    AND c.portal_enabled = true
    AND cl.is_public = true
    AND cl.is_active = true
    AND (p_location_type IS NULL OR cl.location_type = p_location_type);
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_session_types(p_center_id uuid, p_ordered_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_invalid_count integer;
BEGIN
  -- Verificar que el usuario tiene acceso al centro
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL OR v_user_center_id != p_center_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este centro';
  END IF;
  
  -- Verificar que el usuario es admin o profesional
  IF NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para reordenar tipos de sesión';
  END IF;
  
  -- Verificar que TODOS los IDs pertenecen al centro especificado
  SELECT COUNT(*) INTO v_invalid_count
  FROM unnest(p_ordered_ids) AS provided_id
  WHERE NOT EXISTS (
    SELECT 1 FROM session_types 
    WHERE id = provided_id AND center_id = p_center_id
  );
  
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Algunos IDs no pertenecen al centro especificado';
  END IF;
  
  -- Actualización en bloque usando unnest con ORDINALITY
  UPDATE session_types st
  SET display_order = o.ord::integer,
      updated_at = now()
  FROM (
    SELECT id, ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) o
  WHERE st.id = o.id
    AND st.center_id = p_center_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', array_length(p_ordered_ids, 1)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_session_type_with_order(p_center_id uuid, p_name text, p_default_price numeric, p_duration_minutes integer, p_color text, p_commission_rate numeric DEFAULT NULL::numeric, p_tax_treatment text DEFAULT NULL::text, p_vat_rate numeric DEFAULT NULL::numeric, p_exemption_code text DEFAULT NULL::text, p_non_subject_code text DEFAULT NULL::text, p_vat_regime_key text DEFAULT NULL::text, p_is_public boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_new_order integer;
  v_new_id uuid;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());

  IF v_user_center_id IS NULL OR v_user_center_id != p_center_id THEN
    RAISE EXCEPTION 'No tienes permiso para este centro';
  END IF;

  IF NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para crear tipos de sesión';
  END IF;

  -- Serializa la asignación de orden por centro sin usar FOR UPDATE con agregados
  PERFORM pg_advisory_xact_lock(hashtextextended(p_center_id::text, 0));

  SELECT COALESCE(MAX(display_order), 0) + 1
    INTO v_new_order
    FROM session_types
   WHERE center_id = p_center_id;

  INSERT INTO session_types (
    center_id, name, default_price, duration_minutes, color,
    commission_rate, tax_treatment, vat_rate, exemption_code,
    non_subject_code, vat_regime_key, is_public, display_order, is_active
  ) VALUES (
    p_center_id, p_name, p_default_price, p_duration_minutes, p_color,
    p_commission_rate,
    COALESCE(p_tax_treatment, 'exempt'),
    p_vat_rate,
    p_exemption_code,
    p_non_subject_code,
    p_vat_regime_key,
    COALESCE(p_is_public, true),
    v_new_order,
    true
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_assessment_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-assessment-token', '')
$function$
;

CREATE OR REPLACE FUNCTION public.verify_assessment_token(assessment_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND id = assessment_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_assessment_token_for_patient(patient_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.verify_assessment_token_for_template(template_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND template_id = template_uuid
    AND access_token IS NOT NULL
  )
$function$
;

CREATE OR REPLACE FUNCTION public.handle_rectificativa_payments(p_original_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_payments numeric;
  v_payment_count int;
  v_debt_id uuid;
BEGIN
  -- Get total payments linked to the original invoice
  SELECT COALESCE(SUM(amount), 0), COUNT(*)
  INTO v_total_payments, v_payment_count
  FROM payments
  WHERE invoice_id = p_original_invoice_id;

  -- If no payments, nothing to do
  IF v_payment_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'no_payments',
      'message', 'No hay pagos que reasignar'
    );
  END IF;

  -- Unlink payments from the original invoice (set invoice_id = NULL)
  -- This marks them as "pending reassignment"
  UPDATE payments
  SET 
    invoice_id = NULL,
    notes = COALESCE(notes, '') || 
      CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
      'Desvinculado por rectificativa de factura. Pendiente de reasignar.',
    updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  -- Update the debt associated with the original invoice
  -- Set paid_amount to 0 and status to pending
  UPDATE debts
  SET 
    paid_amount = 0,
    status = 'pending',
    updated_at = now()
  WHERE invoice_id = p_original_invoice_id
  RETURNING id INTO v_debt_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'payments_unlinked',
    'message', format('Se han desvinculado %s pago(s) por un total de %s€. Pendientes de reasignar.', v_payment_count, v_total_payments),
    'unlinked_payments', v_payment_count,
    'unlinked_amount', v_total_payments,
    'debt_id', v_debt_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sanitize_error_payload(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  sanitized jsonb;
  sensitive_keys text[] := ARRAY[
    'access_token', 'refresh_token', 'client_secret', 'authorization_code',
    'id_token', 'code', 'token', 'secret', 'password', 'key', 'apikey',
    'api_key', 'bearer', 'credential', 'credentials'
  ];
  k text;
BEGIN
  IF payload IS NULL THEN
    RETURN NULL;
  END IF;
  
  sanitized := payload;
  
  -- Remove sensitive keys at top level
  FOREACH k IN ARRAY sensitive_keys LOOP
    IF sanitized ? k THEN
      sanitized := sanitized - k;
      sanitized := sanitized || jsonb_build_object(k, '[REDACTED]');
    END IF;
  END LOOP;
  
  RETURN sanitized;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.log_integration_error(p_professional_id uuid, p_provider text, p_source text, p_step text DEFAULT NULL::text, p_http_status integer DEFAULT NULL::integer, p_error_code text DEFAULT NULL::text, p_message text DEFAULT NULL::text, p_raw jsonb DEFAULT NULL::jsonb, p_correlation_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_error_id uuid;
BEGIN
  INSERT INTO public.integration_errors (
    professional_id,
    provider,
    source,
    step,
    http_status,
    error_code,
    message,
    raw,
    correlation_id
  ) VALUES (
    p_professional_id,
    p_provider,
    p_source,
    p_step,
    p_http_status,
    p_error_code,
    p_message,
    public.sanitize_error_payload(p_raw),
    p_correlation_id
  )
  RETURNING id INTO v_error_id;
  
  RETURN v_error_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_center_for_session_token(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'postal_code', c.postal_code,
    'phone', c.phone,
    'email', c.email,
    'logo_url', c.logo_url
  ) INTO v_result
  FROM centers c
  JOIN sessions s ON s.center_id = c.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_professional_for_session_token(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', pr.id,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'specialty', pr.specialty,
    'avatar_url', pr.avatar_url
  ) INTO v_result
  FROM profiles pr
  JOIN sessions s ON s.professional_id = pr.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_patient_for_session_token(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'is_minor', p.is_minor
  ) INTO v_result
  FROM patients p
  JOIN sessions s ON s.patient_id = p.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.uuid_to_lock_id(p_uuid uuid)
 RETURNS bigint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ('x' || substr(p_uuid::text, 1, 16))::bit(64)::bigint
$function$
;

CREATE OR REPLACE FUNCTION public.handle_google_webhook_debounce(p_professional_id uuid, p_calendar_id text, p_debounce_seconds integer DEFAULT 60)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_row google_sync_debounce%ROWTYPE;
    v_should_trigger boolean := false;
    v_now timestamptz := now();
BEGIN
    -- Upsert atómico con lock
    INSERT INTO public.google_sync_debounce (professional_id, calendar_id, last_webhook_at, pending, updated_at)
    VALUES (p_professional_id, p_calendar_id, v_now, true, v_now)
    ON CONFLICT (professional_id) DO UPDATE SET
        last_webhook_at = v_now,
        pending = true,
        calendar_id = COALESCE(EXCLUDED.calendar_id, google_sync_debounce.calendar_id),
        updated_at = v_now
    RETURNING * INTO v_row;
    
    -- Determinar si debemos disparar sync
    IF v_row.last_sync_trigger_at IS NULL OR 
       (v_now - v_row.last_sync_trigger_at) > (p_debounce_seconds || ' seconds')::interval THEN
        -- Ha pasado suficiente tiempo, disparar sync
        UPDATE public.google_sync_debounce
        SET last_sync_trigger_at = v_now,
            pending = false,
            updated_at = v_now
        WHERE professional_id = p_professional_id;
        
        v_should_trigger := true;
        RAISE LOG '[WEBHOOK:DEBOUNCE] Triggering sync for % (last trigger was % ago)', 
            p_professional_id, 
            COALESCE(v_now - v_row.last_sync_trigger_at, interval '999 hours');
    ELSE
        RAISE LOG '[WEBHOOK:DEBOUNCE] Skipping sync for % (last trigger was % ago, waiting for % seconds)', 
            p_professional_id, 
            v_now - v_row.last_sync_trigger_at,
            p_debounce_seconds;
    END IF;
    
    RETURN v_should_trigger;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.compute_patient_status(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient RECORD;
  v_has_future_session boolean;
  v_last_completed_session timestamptz;
  v_result jsonb;
  v_new_status patient_status;
  v_reason text;
BEGIN
  -- Obtener el paciente
  SELECT * INTO v_patient
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Patient not found');
  END IF;
  
  -- Si está marcado manualmente como 'discharged', no cambiar
  IF v_patient.status = 'discharged' AND v_patient.status_source = 'manual' THEN
    RETURN jsonb_build_object(
      'status', 'discharged',
      'source', 'manual',
      'reason', 'manual_discharge',
      'changed', false
    );
  END IF;
  
  -- Verificar si tiene cita futura vigente (no cancelada, no no_show)
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE patient_id = p_patient_id
    AND (
      -- Cita futura: session_date > hoy, O session_date = hoy Y start_time > ahora
      (session_date > CURRENT_DATE)
      OR (session_date = CURRENT_DATE AND start_time > CURRENT_TIME)
    )
    AND status IN ('scheduled', 'confirmed', 'pending_approval', 'reschedule_requested')
  ) INTO v_has_future_session;
  
  IF v_has_future_session THEN
    v_new_status := 'active';
    v_reason := 'future_appointment';
  ELSE
    -- Buscar última sesión completada
    SELECT MAX(
      (session_date || ' ' || start_time)::timestamptz
    ) INTO v_last_completed_session
    FROM public.sessions
    WHERE patient_id = p_patient_id
    AND status = 'completed';
    
    IF v_last_completed_session IS NOT NULL AND 
       v_last_completed_session >= (NOW() - INTERVAL '30 days') THEN
      v_new_status := 'active';
      v_reason := 'last_session_within_30d';
    ELSE
      v_new_status := 'inactive';
      v_reason := 'inactive_no_activity';
    END IF;
  END IF;
  
  -- Actualizar solo si cambió o si era manual y ahora debe ser auto
  IF v_patient.status != v_new_status OR v_patient.status_source != 'auto' THEN
    UPDATE public.patients
    SET 
      status = v_new_status,
      status_source = 'auto',
      status_reason = v_reason,
      status_updated_at = NOW(),
      updated_at = NOW()
    WHERE id = p_patient_id
    AND (status_source = 'auto' OR status != 'discharged'); -- No sobrescribir discharge manual
    
    RETURN jsonb_build_object(
      'status', v_new_status,
      'source', 'auto',
      'reason', v_reason,
      'changed', true,
      'previous_status', v_patient.status
    );
  END IF;
  
  RETURN jsonb_build_object(
    'status', v_new_status,
    'source', 'auto',
    'reason', v_reason,
    'changed', false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_patient_discharged(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
BEGIN
  -- Verificar permisos
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- Verificar que el paciente pertenece al centro
  SELECT center_id INTO v_patient_center_id
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;
  
  -- Verificar rol
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  UPDATE public.patients
  SET 
    status = 'discharged',
    status_source = 'manual',
    status_reason = 'manual_discharge',
    status_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_patient_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'status', 'discharged',
    'source', 'manual'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.remove_patient_discharged(p_patient_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_patient_center_id uuid;
  v_result jsonb;
BEGIN
  -- Verificar permisos
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- Verificar que el paciente pertenece al centro
  SELECT center_id INTO v_patient_center_id
  FROM public.patients
  WHERE id = p_patient_id;
  
  IF v_patient_center_id IS NULL OR v_patient_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;
  
  -- Verificar rol
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;
  
  -- Recalcular estado automáticamente
  v_result := public.compute_patient_status(p_patient_id);
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_all_patient_statuses(p_center_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient RECORD;
  v_updated_count int := 0;
  v_total_count int := 0;
  v_center_filter uuid;
BEGIN
  v_center_filter := COALESCE(p_center_id, get_user_center_id(auth.uid()));
  
  FOR v_patient IN 
    SELECT id FROM public.patients 
    WHERE center_id = v_center_filter
    AND (status_source = 'auto' OR status_source IS NULL OR status != 'discharged')
  LOOP
    PERFORM public.compute_patient_status(v_patient.id);
    v_total_count := v_total_count + 1;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'processed', v_total_count,
    'center_id', v_center_filter
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_patient_status_on_session_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id uuid;
BEGIN
  -- Determinar el patient_id afectado
  IF TG_OP = 'DELETE' THEN
    v_patient_id := OLD.patient_id;
  ELSE
    v_patient_id := NEW.patient_id;
  END IF;
  
  -- Si el paciente está en ALTA manual, no recalcular
  IF EXISTS (
    SELECT 1 FROM public.patients 
    WHERE id = v_patient_id 
    AND status = 'discharged' 
    AND status_source = 'manual'
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Recalcular estado del paciente
  PERFORM public.compute_patient_status(v_patient_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_referral_specialties(center_slug text)
 RETURNS TABLE(name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT rs.name
  FROM referral_specialties rs
  JOIN centers c ON c.id = rs.center_id
  WHERE c.portal_slug = center_slug
    AND rs.active = true
  ORDER BY rs.priority, rs.name;
$function$
;

CREATE OR REPLACE FUNCTION public.create_bono_with_debt(p_patient_id uuid, p_name text, p_total_sessions integer, p_price_per_session numeric, p_total_price numeric, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_center_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_bono_id uuid;
  v_debt_id uuid;
BEGIN
  -- Resolve center_id
  v_user_center_id := COALESCE(p_center_id, get_user_center_id(auth.uid()));
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  -- Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Verify patient belongs to center
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND center_id = v_user_center_id) THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;

  -- 1. Create bono
  INSERT INTO bonos (
    patient_id, center_id, name, total_sessions, 
    price_per_session, total_price, expires_at, 
    used_sessions, status
  ) VALUES (
    p_patient_id, v_user_center_id, p_name, p_total_sessions,
    p_price_per_session, p_total_price, p_expires_at,
    0, 'active'
  )
  RETURNING id INTO v_bono_id;

  -- 2. Create debt (only if price > 0)
  IF p_total_price > 0 THEN
    INSERT INTO debts (
      patient_id, bono_id, amount, paid_amount, 
      status, notes, center_id
    ) VALUES (
      p_patient_id, v_bono_id, p_total_price, 0,
      'pending',
      'Bono: ' || p_name || ' (' || p_total_sessions || ' sesiones)',
      v_user_center_id
    )
    RETURNING id INTO v_debt_id;
  END IF;

  RETURN jsonb_build_object(
    'bono_id', v_bono_id,
    'debt_id', v_debt_id
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_complete_past_sessions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
  today_madrid date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  UPDATE sessions s
  SET status = 'completed', updated_at = now()
  WHERE s.status IN ('scheduled', 'confirmed')
    AND s.session_date < today_madrid
    AND (
      s.price = 0
      OR s.payment_status = 'paid'
      OR EXISTS (SELECT 1 FROM debts d WHERE d.session_id = s.id AND d.status = 'paid')
    )
    AND NOT EXISTS (
      SELECT 1 FROM debts d
      WHERE d.session_id = s.id
        AND d.status IN ('pending', 'partial')
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated', updated_count,
    'today_madrid', today_madrid,
    'timestamp', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_safe_center(p_center_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_center_id != public.get_user_center_id(auth.uid()) THEN
    RETURN NULL;
  END IF;

  SELECT to_jsonb(c) INTO v_result FROM public.centers c WHERE c.id = p_center_id;

  IF v_result IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    v_result := v_result
      - 'verifactu_certificate_base64'
      - 'verifactu_certificate_password'
      - 'whatsapp_access_token'
      - 'oauth_google_credentials'
      - 'oauth_zoom_credentials'
      - 'oauth_stripe_credentials'
      - 'oauth_google_drive_credentials'
      - 'openai_api_key_encrypted'
      - 'gemini_api_key_encrypted';
  END IF;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reset_reminder_on_reschedule()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (OLD.session_date IS DISTINCT FROM NEW.session_date)
     OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.acquire_verifactu_chain_lock(p_center_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lock_id bigint;
  acquired boolean;
BEGIN
  lock_id := public.uuid_to_lock_id(p_center_id);
  SELECT pg_try_advisory_lock(54321, lock_id::int) INTO acquired;
  IF acquired THEN
    RAISE LOG '[VERIFACTU:LOCK] Acquired chain lock for center %', p_center_id;
  ELSE
    RAISE LOG '[VERIFACTU:LOCK] Chain lock already held for center %', p_center_id;
  END IF;
  RETURN acquired;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_verifactu_chain_lock(p_center_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  lock_id bigint;
BEGIN
  lock_id := public.uuid_to_lock_id(p_center_id);
  PERFORM pg_advisory_unlock(54321, lock_id::int);
  RAISE LOG '[VERIFACTU:LOCK] Released chain lock for center %', p_center_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_autoregistro_token()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-autoregistro-token', '')
$function$
;

CREATE OR REPLACE FUNCTION public.verify_autoregistro_token(link_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.autoregistro_links
    WHERE access_token = public.get_autoregistro_token()
    AND id = link_uuid
    AND status = 'active'
    AND access_token IS NOT NULL
  )
$function$
;

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
$function$
;

CREATE OR REPLACE FUNCTION public.acquire_verifactu_chain_lock_v2(p_center_id uuid, p_nif_emisor text DEFAULT NULL::text, p_lock_timeout_seconds integer DEFAULT 30)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_id text;
  v_updated int;
BEGIN
  v_lock_id := gen_random_uuid()::text;
  
  -- Try to acquire lock: only if not locked or lock has expired
  UPDATE public.verifactu_chain_status
  SET locked_at = now(),
      locked_by = v_lock_id
  WHERE center_id = p_center_id
    AND (p_nif_emisor IS NULL OR nif_emisor = p_nif_emisor)
    AND (locked_at IS NULL OR locked_at < now() - (p_lock_timeout_seconds || ' seconds')::interval);
  
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  
  IF v_updated > 0 THEN
    RAISE LOG '[VERIFACTU:LOCK_V2] Acquired lock % for center %', v_lock_id, p_center_id;
    RETURN v_lock_id;
  END IF;
  
  -- If no row exists yet, insert one with lock
  IF NOT EXISTS (SELECT 1 FROM public.verifactu_chain_status WHERE center_id = p_center_id) THEN
    INSERT INTO public.verifactu_chain_status (center_id, nif_emisor, id_sistema_informatico, numero_instalacion, locked_at, locked_by)
    VALUES (p_center_id, COALESCE(p_nif_emisor, ''), '01', 1, now(), v_lock_id)
    ON CONFLICT DO NOTHING;
    
    -- Check if we got it
    IF EXISTS (SELECT 1 FROM public.verifactu_chain_status WHERE center_id = p_center_id AND locked_by = v_lock_id) THEN
      RAISE LOG '[VERIFACTU:LOCK_V2] Acquired lock % for center % (new row)', v_lock_id, p_center_id;
      RETURN v_lock_id;
    END IF;
  END IF;
  
  RAISE LOG '[VERIFACTU:LOCK_V2] Failed to acquire lock for center % (held by another process)', p_center_id;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_verifactu_chain_lock_v2(p_center_id uuid, p_lock_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.verifactu_chain_status
  SET locked_at = NULL,
      locked_by = NULL
  WHERE center_id = p_center_id
    AND locked_by = p_lock_id;
  
  RAISE LOG '[VERIFACTU:LOCK_V2] Released lock % for center %', p_lock_id, p_center_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_default_per_day()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_default IS NOT DISTINCT FROM NEW.is_default THEN
    RETURN NEW;
  END IF;

  SELECT center_id INTO v_center_id
  FROM public.center_locations WHERE id = NEW.location_id;

  IF v_center_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.location_schedules ls
  SET is_default = false
  FROM public.center_locations cl
  WHERE ls.location_id = cl.id
    AND cl.center_id = v_center_id
    AND ls.day_of_week = NEW.day_of_week
    AND ls.id IS DISTINCT FROM NEW.id
    AND ls.is_default = true;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_pending_debts_db()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  created_count integer := 0;
BEGIN
  INSERT INTO debts (patient_id, center_id, session_id, amount, paid_amount, status, due_date, notes)
  SELECT
    s.patient_id,
    s.center_id,
    s.id,
    s.price,
    0,
    'pending',
    s.session_date,
    'Deuda generada automáticamente para sesión del ' || s.session_date::text
  FROM sessions s
  WHERE s.session_date < CURRENT_DATE
    AND s.payment_status = 'pending'
    AND s.status NOT IN ('cancelled', 'no_show', 'blocked')
    AND s.bono_id IS NULL
    AND s.price > 0
    AND NOT EXISTS (
      SELECT 1 FROM debts d
      WHERE d.session_id = s.id
        AND d.status <> 'refunded'
    )
    AND NOT EXISTS (
      SELECT 1 FROM invoice_items ii WHERE ii.session_id = s.id
    );

  GET DIAGNOSTICS created_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'created', created_count,
    'timestamp', now()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_no_session_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Allow user-confirmed overlap override
  IF current_setting('app.allow_session_overlap', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.professional_id = NEW.professional_id
      AND s.session_date = NEW.session_date
      AND s.id != NEW.id
      AND s.status != 'cancelled'
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'La sesión se solapa con otra cita existente del profesional'
      USING ERRCODE = 'exclusion_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limit_entries()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.rate_limit_log
  WHERE created_at < now() - interval '2 hours';
$function$
;

CREATE OR REPLACE FUNCTION public.record_audit_event(p_user_id uuid, p_user_role text, p_organization_id uuid, p_patient_id uuid, p_resource_type text, p_resource_id text, p_action text, p_status text DEFAULT 'success'::text, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_session_id text DEFAULT NULL::text, p_request_method text DEFAULT NULL::text, p_route_or_endpoint text DEFAULT NULL::text, p_justification text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.audit_clinical_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_audit_logs(p_from timestamp with time zone DEFAULT (now() - '7 days'::interval), p_to timestamp with time zone DEFAULT now(), p_user_id uuid DEFAULT NULL::uuid, p_patient_id uuid DEFAULT NULL::uuid, p_action text DEFAULT NULL::text, p_resource_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_anomalous_only boolean DEFAULT false, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, seq bigint, user_id uuid, user_role text, organization_id uuid, patient_id uuid, resource_type text, resource_id text, action text, justification text, ip_address text, user_agent text, status text, metadata jsonb, previous_hash text, current_hash text, is_anomalous boolean, anomaly_reason text, user_first_name text, user_last_name text, patient_first_name text, patient_last_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_current_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.app_versions
    SET is_current = false, updated_at = now()
    WHERE is_current = true AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_center_for_debt(p_center_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'bizum_phone', c.bizum_phone,
    'has_stripe', (c.oauth_stripe_credentials IS NOT NULL)
  ) INTO v_result
  FROM public.centers c
  WHERE c.id = p_center_id;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_center_for_invoice(p_center_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'postal_code', c.postal_code,
    'province', c.province,
    'tax_id', c.tax_id,
    'phone', c.phone,
    'email', c.email,
    'invoice_logo_url', c.invoice_logo_url,
    'invoice_footer', c.invoice_footer,
    'invoice_data_protection_text', c.invoice_data_protection_text
  ) INTO v_result
  FROM public.centers c
  WHERE c.id = p_center_id;
  
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_center_info(p_center_id uuid)
 RETURNS TABLE(id uuid, name text, address text, city text, postal_code text, province text, phone text, email text, logo_url text, invoice_logo_url text, invoice_footer text, invoice_data_protection_text text, portal_slug text, portal_enabled boolean, portal_require_approval boolean, portal_allow_professional_selection boolean, portal_default_professional_id uuid, public_domain text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.name, c.address, c.city, c.postal_code,
    c.province, c.phone, c.email, c.logo_url,
    c.invoice_logo_url, c.invoice_footer,
    c.invoice_data_protection_text,
    c.portal_slug, c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.public_domain
  FROM public.centers c
  WHERE c.id = p_center_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_center_by_slug(p_slug text)
 RETURNS TABLE(id uuid, name text, address text, city text, phone text, email text, logo_url text, portal_slug text, portal_enabled boolean, portal_require_approval boolean, portal_allow_professional_selection boolean, portal_default_professional_id uuid, public_domain text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.name, c.address, c.city, c.phone, c.email,
    c.logo_url, c.portal_slug, c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.public_domain
  FROM public.centers c
  WHERE c.portal_slug = p_slug
    AND c.portal_enabled = true;
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.merge_patients(p_primary_id uuid, p_secondary_id uuid, p_field_overrides jsonb DEFAULT '{}'::jsonb)
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
$function$
;

CREATE OR REPLACE FUNCTION public.special_days_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_custom_price_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_overlap_count INTEGER;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM patient_custom_prices
  WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND patient_id = NEW.patient_id
    AND target_type = NEW.target_type
    AND target_id = NEW.target_id
    AND is_active = true
    AND (
      (NEW.start_date, COALESCE(NEW.end_date, '9999-12-31'::DATE))
      OVERLAPS
      (start_date, COALESCE(end_date, '9999-12-31'::DATE))
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Ya existe una tarifa personalizada activa para este paciente y servicio/bono en ese rango de fechas.';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_patient_custom_prices_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_custom_price_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO patient_custom_price_history (
      patient_custom_price_id, patient_id, center_id, target_type, target_id,
      old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
      NULL, NEW.custom_price, NULL, NEW.start_date, NULL, NEW.end_date,
      'created', NEW.created_by
    );

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active AND NOT NEW.is_active THEN
      INSERT INTO patient_custom_price_history (
        patient_custom_price_id, patient_id, center_id, target_type, target_id,
        old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
        change_type, changed_by
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
        OLD.custom_price, NEW.custom_price, OLD.start_date, NEW.start_date, OLD.end_date, NEW.end_date,
        'deactivated', NEW.created_by
      );
    ELSIF OLD.custom_price != NEW.custom_price
       OR OLD.start_date != NEW.start_date
       OR OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      INSERT INTO patient_custom_price_history (
        patient_custom_price_id, patient_id, center_id, target_type, target_id,
        old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
        change_type, changed_by
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
        OLD.custom_price, NEW.custom_price, OLD.start_date, NEW.start_date, OLD.end_date, NEW.end_date,
        'updated', NEW.created_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_applicable_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN resolve_effective_price(p_patient_id, p_target_type, p_target_id, p_reference_date);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_default_tariff_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE tariff_plans SET is_default = false
    WHERE center_id = NEW.center_id AND id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tariff_plans_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_tariff_plan_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_tariff_assignment_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER;
BEGIN
  IF NOT NEW.is_active THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM patient_tariff_plan_assignments
  WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND patient_id = NEW.patient_id AND is_active = true
    AND ((NEW.start_date, COALESCE(NEW.end_date, '9999-12-31'::DATE))
         OVERLAPS (start_date, COALESCE(end_date, '9999-12-31'::DATE)));
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Este paciente ya tiene una tarifa asignada activa en ese rango de fechas.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_ptpa_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_effective_price(p_patient_id uuid, p_target_type text, p_target_id uuid, p_reference_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base_price NUMERIC(10,2);
  v_custom RECORD;
  v_assignment RECORD;
  v_tariff_price NUMERIC(10,2);
  v_plan_name TEXT;
BEGIN
  IF p_target_type = 'session_type' THEN
    SELECT default_price INTO v_base_price FROM session_types
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  ELSIF p_target_type = 'bono_template' THEN
    SELECT total_price INTO v_base_price FROM bono_templates
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  END IF;

  SELECT * INTO v_custom FROM patient_custom_prices
  WHERE patient_id = p_patient_id AND target_type = p_target_type
    AND target_id = p_target_id AND is_active = true
    AND start_date <= p_reference_date
    AND (end_date IS NULL OR end_date >= p_reference_date)
  ORDER BY start_date DESC LIMIT 1;

  IF v_custom.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'base_price', v_base_price, 'applied_price', v_custom.custom_price,
      'pricing_source', 'custom', 'tariff_plan_id', NULL, 'tariff_plan_name', NULL,
      'tariff_plan_assignment_id', NULL, 'custom_price_id', v_custom.id,
      'is_temporary', v_custom.end_date IS NOT NULL,
      'valid_from', v_custom.start_date, 'valid_to', v_custom.end_date,
      'note', v_custom.notes
    );
  END IF;

  SELECT a.* INTO v_assignment FROM patient_tariff_plan_assignments a
  WHERE a.patient_id = p_patient_id AND a.is_active = true
    AND a.start_date <= p_reference_date
    AND (a.end_date IS NULL OR a.end_date >= p_reference_date)
  ORDER BY a.start_date DESC LIMIT 1;

  IF v_assignment.id IS NOT NULL THEN
    SELECT tpi.price, tp.name INTO v_tariff_price, v_plan_name
    FROM tariff_plan_items tpi JOIN tariff_plans tp ON tp.id = tpi.tariff_plan_id
    WHERE tpi.tariff_plan_id = v_assignment.tariff_plan_id
      AND tpi.target_type = p_target_type AND tpi.target_id = p_target_id
      AND tp.is_active = true;
    IF v_tariff_price IS NOT NULL THEN
      RETURN jsonb_build_object(
        'base_price', v_base_price, 'applied_price', v_tariff_price,
        'pricing_source', 'tariff_plan', 'tariff_plan_id', v_assignment.tariff_plan_id,
        'tariff_plan_name', v_plan_name, 'tariff_plan_assignment_id', v_assignment.id,
        'custom_price_id', NULL, 'is_temporary', v_assignment.end_date IS NOT NULL,
        'valid_from', v_assignment.start_date, 'valid_to', v_assignment.end_date,
        'note', v_assignment.notes
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'base_price', v_base_price, 'applied_price', v_base_price,
    'pricing_source', 'base', 'tariff_plan_id', NULL, 'tariff_plan_name', NULL,
    'tariff_plan_assignment_id', NULL, 'custom_price_id', NULL,
    'is_temporary', false, 'valid_from', NULL, 'valid_to', NULL, 'note', NULL
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.collect_session_payment_v2(p_session_id uuid, p_patient_id uuid, p_amount numeric, p_payment_method text, p_payment_date date DEFAULT CURRENT_DATE, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
  v_session_price numeric(10,2);
  v_session_bono uuid;
  v_debt RECORD;
  v_remaining numeric(10,2);
  v_new_paid numeric(10,2);
  v_new_status payment_status;
  v_payment_id uuid;
  v_invoice_total numeric(10,2);
  v_invoice_paid numeric(10,2);
  v_invoice_status invoice_status;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  SELECT center_id, price, bono_id INTO v_center_id, v_session_price, v_session_bono
  FROM public.sessions WHERE id = p_session_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'Sesión no encontrada';
  END IF;

  IF v_center_id <> public.get_user_center_id(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para esta sesión';
  END IF;

  IF v_session_bono IS NOT NULL THEN
    RAISE EXCEPTION 'Esta sesión está cubierta por un bono';
  END IF;

  -- Try to find an active debt
  SELECT d.*
  INTO v_debt
  FROM public.debts d
  LEFT JOIN public.invoices i ON i.id = d.invoice_id
  WHERE d.session_id = p_session_id
    AND d.patient_id = p_patient_id
    AND d.status <> 'refunded'
    AND (i.id IS NULL OR i.is_valid = true)
  ORDER BY
    CASE WHEN d.invoice_id IS NOT NULL THEN 0 ELSE 1 END,
    d.created_at DESC
  LIMIT 1
  FOR UPDATE OF d;

  -- If no debt exists, create one based on the session price
  IF v_debt.id IS NULL THEN
    IF COALESCE(v_session_price, 0) <= 0 THEN
      RAISE EXCEPTION 'La sesión no tiene importe a cobrar';
    END IF;

    INSERT INTO public.debts (
      center_id, patient_id, session_id, amount, paid_amount, status, due_date
    ) VALUES (
      v_center_id, p_patient_id, p_session_id, v_session_price, 0,
      'pending'::payment_status, CURRENT_DATE
    )
    RETURNING * INTO v_debt;
  END IF;

  v_remaining := GREATEST(v_debt.amount - COALESCE(v_debt.paid_amount, 0), 0);

  IF v_remaining < 0.01 THEN
    RAISE EXCEPTION 'La sesión ya está cobrada';
  END IF;

  IF p_amount - v_remaining > 0.01 THEN
    RAISE EXCEPTION 'El importe (%.2f) excede el saldo pendiente (%.2f)', p_amount, v_remaining;
  END IF;

  INSERT INTO public.payments (
    center_id, patient_id, session_id, invoice_id,
    amount, payment_method, payment_date, reference, notes
  ) VALUES (
    v_center_id, p_patient_id, p_session_id, v_debt.invoice_id,
    p_amount, p_payment_method, p_payment_date, p_reference, p_notes
  )
  RETURNING id INTO v_payment_id;

  v_new_paid := COALESCE(v_debt.paid_amount, 0) + p_amount;
  IF v_new_paid >= v_debt.amount - 0.01 THEN
    v_new_status := 'paid'::payment_status;
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial'::payment_status;
  ELSE
    v_new_status := 'pending'::payment_status;
  END IF;

  UPDATE public.debts
  SET paid_amount = v_new_paid, status = v_new_status, updated_at = now()
  WHERE id = v_debt.id;

  -- Sync session payment_status
  UPDATE public.sessions
  SET payment_status = v_new_status::text, updated_at = now()
  WHERE id = p_session_id;

  -- Sync invoice if linked
  IF v_debt.invoice_id IS NOT NULL THEN
    SELECT total INTO v_invoice_total FROM public.invoices WHERE id = v_debt.invoice_id;
    SELECT COALESCE(SUM(amount), 0) INTO v_invoice_paid
    FROM public.payments WHERE invoice_id = v_debt.invoice_id;

    IF v_invoice_paid >= v_invoice_total - 0.01 THEN
      v_invoice_status := 'paid'::invoice_status;
    ELSIF v_invoice_paid > 0 THEN
      v_invoice_status := 'partial'::invoice_status;
    ELSE
      v_invoice_status := 'pending'::invoice_status;
    END IF;

    UPDATE public.invoices
    SET status = v_invoice_status, updated_at = now()
    WHERE id = v_debt.invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'debt_id', v_debt.id,
    'invoice_id', v_debt.invoice_id,
    'amount_paid', p_amount,
    'total_paid', v_new_paid,
    'debt_amount', v_debt.amount,
    'remaining', GREATEST(v_debt.amount - v_new_paid, 0),
    'status', v_new_status::text
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_resolved_price_to_session()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r jsonb;
BEGIN
  IF NEW.session_type_id IS NULL OR NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.pricing_source,'') NOT IN ('custom','tariff_plan') THEN
    SELECT resolve_effective_price(
      NEW.patient_id, 'session_type', NEW.session_type_id, NEW.session_date::date
    ) INTO r;
    IF r IS NOT NULL THEN
      NEW.base_price_snapshot := COALESCE(NEW.base_price_snapshot, NULLIF(r->>'base_price','')::numeric);
      NEW.pricing_source      := COALESCE(NULLIF(r->>'pricing_source',''), 'base');
      IF (r->>'pricing_source') IN ('custom','tariff_plan') THEN
        NEW.price                              := (r->>'applied_price')::numeric;
        NEW.custom_price_id                    := NULLIF(r->>'custom_price_id','')::uuid;
        NEW.tariff_plan_id_snapshot            := NULLIF(r->>'tariff_plan_id','')::uuid;
        NEW.tariff_plan_assignment_id_snapshot := NULLIF(r->>'tariff_plan_assignment_id','')::uuid;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.convert_calendar_event_to_session(p_calendar_event_id uuid, p_patient_id uuid, p_session_type text, p_price numeric, p_session_modality text DEFAULT 'in_person'::text, p_location_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text, p_bono_id uuid DEFAULT NULL::uuid, p_session_type_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event record;
  v_session_id uuid;
  v_session_date date;
  v_start_time time;
  v_end_time time;
  v_center_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.calendar_events
  WHERE id = p_calendar_event_id AND is_converted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento no encontrado o ya convertido';
  END IF;

  SELECT center_id INTO v_center_id FROM public.profiles WHERE id = v_event.professional_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el centro del profesional';
  END IF;

  v_session_date := DATE(v_event.start_at AT TIME ZONE 'Europe/Madrid');
  v_start_time := (v_event.start_at AT TIME ZONE 'Europe/Madrid')::time;
  v_end_time := (v_event.end_at AT TIME ZONE 'Europe/Madrid')::time;

  INSERT INTO public.sessions (
    center_id, patient_id, professional_id, session_date, start_time, end_time,
    session_type, session_type_id, price, status, session_modality, location_id, notes, bono_id,
    google_calendar_event_id
  ) VALUES (
    v_center_id, p_patient_id, v_event.professional_id, v_session_date, v_start_time, v_end_time,
    p_session_type, p_session_type_id, p_price, 'scheduled', p_session_modality, p_location_id,
    COALESCE(p_notes, 'Convertido desde: ' || COALESCE(v_event.summary, 'Evento externo')),
    p_bono_id, v_event.google_event_id
  ) RETURNING id INTO v_session_id;

  UPDATE public.calendar_events SET
    is_converted = true,
    converted_session_id = v_session_id,
    converted_at = now()
  WHERE id = p_calendar_event_id;

  RETURN v_session_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_consent_anon_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    -- Anonymous token-based updates may only change completion/signature fields.
    -- Keep protected identity, ownership and document fields immutable from public links.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.requires_guardian IS DISTINCT FROM OLD.requires_guardian
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
       OR NEW.uploaded_file_url IS DISTINCT FROM OLD.uploaded_file_url
       OR NEW.source IS DISTINCT FROM OLD.source
    THEN
      RAISE EXCEPTION 'Anonymous updates can only modify signature/verification fields on consents';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_session_anon_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Trusted backend contexts (service role, migrations, cron) bypass the guard
  IF auth.uid() IS NULL
     AND coalesce(current_setting('request.jwt.claim.role', true), auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
  THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
       OR NEW.price IS DISTINCT FROM OLD.price
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.bono_id IS DISTINCT FROM OLD.bono_id
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Anonymous updates cannot modify protected fields on sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_profile_center_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.has_role(auth.uid(), 'admin') THEN
    -- Allow the initial center assignment (bootstrap): profile has no center yet.
    IF NEW.center_id IS DISTINCT FROM OLD.center_id AND OLD.center_id IS NOT NULL THEN
      RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
    END IF;
    IF NEW.center_id IS DISTINCT FROM OLD.center_id AND OLD.center_id IS NULL AND NEW.center_id IS NULL THEN
      RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'No puedes cambiar tu estado activo';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_session_datetime_force(p_session_id uuid, p_session_date date, p_start_time time without time zone, p_end_time time without time zone)
 RETURNS sessions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
  v_session public.sessions;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT center_id INTO v_center_id
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'User center not found';
  END IF;

  IF NOT (public.is_admin(v_user_id) OR public.is_professional(v_user_id)) THEN
    RAISE EXCEPTION 'Insufficient privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sessions
    WHERE id = p_session_id
      AND center_id = v_center_id
  ) THEN
    RAISE EXCEPTION 'Session not found or access denied';
  END IF;

  PERFORM set_config('app.allow_session_overlap', 'on', true);

  UPDATE public.sessions
  SET session_date = p_session_date,
      start_time = p_start_time,
      end_time = p_end_time,
      updated_at = now()
  WHERE id = p_session_id
    AND center_id = v_center_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.try_acquire_google_sync_lock(p_professional_id uuid, p_lock_token uuid, p_lease_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_rows integer;
BEGIN
  INSERT INTO public.google_sync_locks (
    professional_id,
    lock_token,
    locked_until,
    updated_at
  )
  VALUES (
    p_professional_id,
    p_lock_token,
    now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
    now()
  )
  ON CONFLICT (professional_id) DO UPDATE
  SET lock_token = EXCLUDED.lock_token,
      locked_until = EXCLUDED.locked_until,
      updated_at = now()
  WHERE google_sync_locks.locked_until <= now();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.release_google_sync_lock(p_professional_id uuid, p_lock_token uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.google_sync_locks
  WHERE professional_id = p_professional_id
    AND lock_token = p_lock_token;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_issued_invoices()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::json->>'role';
BEGIN
  -- service_role (edge functions, cron) puede operar libremente
  IF v_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'No se puede eliminar una factura emitida (%). Crea una factura rectificativa.', OLD.invoice_number
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: en draft, todo permitido
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Factura emitida: bloquear cambios a campos fiscales / identitarios
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.series_id IS DISTINCT FROM OLD.series_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.center_id IS DISTINCT FROM OLD.center_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.retention_rate IS DISTINCT FROM OLD.retention_rate
     OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.rectified_invoice_id IS DISTINCT FROM OLD.rectified_invoice_id
     OR NEW.rectification_type IS DISTINCT FROM OLD.rectification_type
     OR NEW.rectification_reason_code IS DISTINCT FROM OLD.rectification_reason_code
     OR NEW.base_rectificada IS DISTINCT FROM OLD.base_rectificada
     OR NEW.cuota_rectificada IS DISTINCT FROM OLD.cuota_rectificada
     OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
     OR NEW.previous_invoice_hash IS DISTINCT FROM OLD.previous_invoice_hash
     OR NEW.verifactu_hash IS DISTINCT FROM OLD.verifactu_hash
     OR NEW.verifactu_registration_id IS DISTINCT FROM OLD.verifactu_registration_id
     OR NEW.verifactu_qr IS DISTINCT FROM OLD.verifactu_qr
     OR NEW.verifactu_timestamp IS DISTINCT FROM OLD.verifactu_timestamp
  THEN
    RAISE EXCEPTION 'No se pueden modificar campos fiscales de una factura emitida (%). Crea una factura rectificativa.', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- No se puede revertir una factura emitida a borrador
  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'No se puede devolver una factura emitida a borrador (%).', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- is_valid sólo puede ir de true a false (rectificación), nunca al revés
  IF OLD.is_valid = false AND NEW.is_valid = true THEN
    RAISE EXCEPTION 'No se puede revalidar una factura ya rectificada (%).', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_invoice_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_locked boolean := (
    OLD.invoice_hash IS NOT NULL
    OR OLD.verifactu_hash IS NOT NULL
    OR OLD.verifactu_registration_id IS NOT NULL
  );
  v_has_aeat_registration boolean := OLD.verifactu_registration_id IS NOT NULL;
  v_allowed_keys text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_old_locked OR COALESCE(OLD.status::text, 'draft') <> 'draft' THEN
      RAISE EXCEPTION 'No se puede eliminar una factura emitida o fiscalmente registrada';
    END IF;

    RETURN OLD;
  END IF;

  IF COALESCE(OLD.status::text, 'draft') = 'draft' AND NOT v_old_locked THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'draft' AND COALESCE(OLD.status::text, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'No se puede devolver una factura emitida a borrador';
  END IF;

  IF OLD.status::text = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'No se puede cambiar el estado de una factura cancelada';
  END IF;

  IF OLD.is_valid = false AND NEW.is_valid IS DISTINCT FROM OLD.is_valid THEN
    RAISE EXCEPTION 'No se puede reactivar una factura invalidada fiscalmente';
  END IF;

  v_allowed_keys := ARRAY[
    'updated_at',
    'status',
    'is_valid',
    'verifactu_pending',
    'verifactu_retry_count',
    'verifactu_error_permanent',
    'verifactu_error_message',
    -- Metadatos no fiscales de documento generado (PDF / Google Drive)
    'pdf_generated_at',
    'drive_file_id',
    'drive_url'
  ];

  IF OLD.status::text <> 'cancelled' AND NEW.status::text = 'cancelled' THEN
    v_allowed_keys := v_allowed_keys || ARRAY[
      'cancellation_date',
      'cancellation_reason'
    ];
  END IF;

  IF NOT v_has_aeat_registration THEN
    v_allowed_keys := v_allowed_keys || ARRAY[
      'invoice_hash',
      'previous_invoice_hash',
      'verifactu_hash',
      'verifactu_qr',
      'verifactu_timestamp',
      'verifactu_registration_id'
    ];
  END IF;

  IF (to_jsonb(NEW) - v_allowed_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_keys) THEN
    RAISE EXCEPTION 'No se pueden modificar los datos fiscales de una factura emitida o registrada';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_invoice_items_mutable(p_invoice_id uuid, p_operation text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_locked boolean;
  v_operation_label text := CASE p_operation
    WHEN 'INSERT' THEN 'anadir'
    WHEN 'UPDATE' THEN 'modificar'
    WHEN 'DELETE' THEN 'eliminar'
    ELSE lower(p_operation)
  END;
BEGIN
  SELECT
    invoice_hash IS NOT NULL
    OR verifactu_hash IS NOT NULL
    OR verifactu_registration_id IS NOT NULL
  INTO v_locked
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la factura asociada a la linea';
  END IF;

  IF v_locked THEN
    RAISE EXCEPTION 'No se pueden % lineas de una factura fiscalmente registrada', v_operation_label;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_invoice_items_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.assert_invoice_items_mutable(OLD.invoice_id, TG_OP);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.assert_invoice_items_mutable(NEW.invoice_id, TG_OP);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_invoice_item_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.record_client_audit_event(p_resource_type text, p_resource_id text DEFAULT NULL::text, p_patient_id uuid DEFAULT NULL::uuid, p_action text DEFAULT 'VIEW'::text, p_route_or_endpoint text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
     AND NOT EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
    BEGIN
      -- Serialize disarm against email_queue_wake on a shared advisory lock, then
      -- re-read under it: an enqueue racing the unschedule either committed (we
      -- see its row and leave the cron) or waits and re-arms after we commit.
      PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
      IF EXISTS (SELECT 1 FROM pgmq.q_auth_emails)
         OR EXISTS (SELECT 1 FROM pgmq.q_transactional_emails) THEN
        RETURN;
      END IF;
      PERFORM cron.unschedule('process-email-queue');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_dispatch: cron unschedule failed: %', SQLERRM;
    END;
    RETURN;
  END IF;

  IF (SELECT retry_after_until FROM public.email_send_state WHERE id = 1) > now() THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Lovable-Context', 'cron',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.email_queue_wake()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  -- Runs inside the enqueue transaction; the outer handler guarantees nothing
  -- below can roll back the customer's email. Shared advisory lock serializes
  -- arming against email_queue_dispatch's disarm.
  PERFORM pg_catalog.pg_advisory_xact_lock(7700000000000001);
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-email-queue') THEN
    BEGIN
      PERFORM cron.schedule('process-email-queue', '5 seconds', $cron$ SELECT public.email_queue_dispatch(); $cron$);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'email_queue_wake: cron schedule failed: %', SQLERRM;
    END;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Lovable-Context', 'cron',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key'
        )
      ),
      body := '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'email_queue_wake failed (enqueue preserved): %', SQLERRM;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.weekly_db_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count bigint;
BEGIN
  -- audit_log: 180-day retention (does NOT touch audit_logs GDPR table)
  WITH d AS (
    DELETE FROM public.audit_log
    WHERE created_at < now() - interval '180 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{audit_log_purged}', to_jsonb(v_count));

  -- rate_limit_log: 7-day retention
  WITH d AS (
    DELETE FROM public.rate_limit_log
    WHERE created_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{rate_limit_purged}', to_jsonb(v_count));

  -- google_sync_debounce and google_sync_locks: >1 day
  WITH d AS (
    DELETE FROM public.google_sync_debounce
    WHERE created_at < now() - interval '1 day'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{google_sync_debounce_purged}', to_jsonb(v_count));

  WITH d AS (
    DELETE FROM public.google_sync_locks
    WHERE created_at < now() - interval '1 day'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{google_sync_locks_purged}', to_jsonb(v_count));

  -- email_send_log: 30-day retention
  WITH d AS (
    DELETE FROM public.email_send_log
    WHERE created_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{email_send_log_purged}', to_jsonb(v_count));

  -- notifications: read >90 days
  WITH d AS (
    DELETE FROM public.notifications
    WHERE read_at IS NOT NULL
      AND read_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{notifications_purged}', to_jsonb(v_count));

  -- ANALYZE large tables
  ANALYZE public.sessions;
  ANALYZE public.calendar_events;
  ANALYZE public.audit_logs;
  ANALYZE public.whatsapp_messages;
  ANALYZE public.audit_log;

  v_result := jsonb_set(v_result, '{ran_at}', to_jsonb(now()));
  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.format_invoice_number_from_series(p_format text, p_series_name text, p_next_number integer, p_issue_date date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT replace(
    replace(
      replace(
        replace(
          replace(
            replace(COALESCE(p_format, '{SERIE}-{AAAA}-{NNNNN}'),
              '{SERIE}', p_series_name),
            '{AAAA}', to_char(p_issue_date, 'YYYY')),
          '{AA}', to_char(p_issue_date, 'YY')),
        '{NNNNN}', lpad(p_next_number::text, 5, '0')),
      '{NNNN}', lpad(p_next_number::text, 4, '0')),
    '{NNN}', lpad(p_next_number::text, 3, '0'));
$function$
;

CREATE OR REPLACE FUNCTION public.move_invoice_financials_for_replacement(p_original_invoice_id uuid, p_target_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_target public.invoices%ROWTYPE;
  v_original public.invoices%ROWTYPE;
  v_paid numeric := 0;
  v_payment_count integer := 0;
  v_debt_status public.payment_status;
  v_effective_paid numeric := 0;
BEGIN
  SELECT * INTO v_original
  FROM public.invoices
  WHERE id = p_original_invoice_id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.invoices
  WHERE id = p_target_invoice_id
  FOR UPDATE;

  IF v_original.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron las facturas para trasladar los cobros';
  END IF;

  IF v_original.center_id <> v_target.center_id
    OR v_original.patient_id <> v_target.patient_id THEN
    RAISE EXCEPTION 'Las facturas de origen y destino no pertenecen al mismo centro y contacto';
  END IF;

  UPDATE public.payments
  SET invoice_id = p_target_invoice_id,
      notes = concat_ws(' | ', NULLIF(notes, ''),
        format('Reasignado de %s por correccion de tipo de factura.', v_original.invoice_number)),
      updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  GET DIAGNOSTICS v_payment_count = ROW_COUNT;

  SELECT COALESCE(sum(amount), 0)
  INTO v_paid
  FROM public.payments
  WHERE invoice_id = p_target_invoice_id;

  v_effective_paid := CASE
    WHEN v_original.status = 'paid' AND v_paid = 0 THEN v_target.total
    ELSE LEAST(v_paid, v_target.total)
  END;

  v_debt_status := CASE
    WHEN v_effective_paid >= v_target.total THEN 'paid'::public.payment_status
    WHEN v_effective_paid > 0 THEN 'partial'::public.payment_status
    ELSE 'pending'::public.payment_status
  END;

  UPDATE public.debts
  SET status = 'refunded',
      paid_amount = 0,
      notes = concat_ws(' | ', NULLIF(notes, ''),
        format('Deuda cerrada: factura sustituida por %s.', v_target.invoice_number)),
      updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  UPDATE public.debts
  SET amount = v_target.total,
      paid_amount = v_effective_paid,
      status = v_debt_status,
      updated_at = now()
  WHERE invoice_id = v_target.id;

  IF NOT FOUND THEN
    INSERT INTO public.debts (
      patient_id, center_id, invoice_id, amount, paid_amount, status, due_date, notes
    ) VALUES (
      v_target.patient_id,
      v_target.center_id,
      v_target.id,
      v_target.total,
      v_effective_paid,
      v_debt_status,
      COALESCE(v_target.due_date, v_target.issue_date),
      'Deuda trasladada por correccion de tipo de factura'
    );
  END IF;

  IF v_debt_status = 'paid' THEN
    UPDATE public.invoices SET status = 'paid', updated_at = now()
    WHERE id = p_target_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_count', v_payment_count,
    'paid_amount', v_effective_paid,
    'debt_status', v_debt_status
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_invoice_type_correction_context(p_original_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice record;
  v_existing record;
  v_series jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden corregir el tipo de una factura';
  END IF;

  SELECT i.*, s.invoice_type AS source_invoice_type
  INTO v_invoice
  FROM public.invoices i
  LEFT JOIN public.invoice_series s ON s.id = i.series_id
  WHERE i.id = p_original_invoice_id
    AND i.center_id = public.get_user_center_id(auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  SELECT id, operation_type, status, resulting_invoice_id
  INTO v_existing
  FROM public.invoice_correction_operations
  WHERE original_invoice_id = p_original_invoice_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'series_type', s.series_type,
    'invoice_type', s.invoice_type,
    'is_default', s.is_default,
    'next_number', s.next_number
  ) ORDER BY s.series_type, s.invoice_type, s.name), '[]'::jsonb)
  INTO v_series
  FROM public.invoice_series s
  WHERE s.center_id = v_invoice.center_id
    AND COALESCE(s.is_archived, false) = false
    AND (
      (s.series_type = 'rectifying' AND s.invoice_type = COALESCE(v_invoice.source_invoice_type, 'complete'))
      OR (s.series_type = 'ordinary' AND s.invoice_type = 'complete')
    );

  SELECT jsonb_build_object(
    'eligible',
      v_invoice.status IN ('issued', 'paid')
      AND v_invoice.is_valid
      AND v_invoice.rectified_invoice_id IS NULL
      AND v_invoice.verifactu_hash IS NOT NULL
      AND COALESCE(v_invoice.verifactu_pending, false) = false
      AND v_existing.id IS NULL,
    'blocker', CASE
      WHEN v_existing.id IS NOT NULL THEN 'already_corrected'
      WHEN v_invoice.status NOT IN ('issued', 'paid') THEN 'invalid_status'
      WHEN NOT v_invoice.is_valid THEN 'invalidated'
      WHEN v_invoice.rectified_invoice_id IS NOT NULL THEN 'is_rectificativa'
      WHEN v_invoice.verifactu_hash IS NULL THEN 'not_fiscally_sealed'
      WHEN COALESCE(v_invoice.verifactu_pending, false) THEN 'aeat_pending'
      ELSE NULL
    END,
    'source_invoice_type', COALESCE(v_invoice.source_invoice_type, 'complete'),
    'can_create_f3', COALESCE(v_invoice.source_invoice_type, 'complete') = 'simplified',
    'existing_operation', CASE WHEN v_existing.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_existing.id,
      'operation_type', v_existing.operation_type,
      'status', v_existing.status,
      'resulting_invoice_id', v_existing.resulting_invoice_id
    ) END,
    'recipient', jsonb_build_object(
      'name', concat_ws(' ', p.first_name, p.last_name),
      'tax_id', p.tax_id,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'email', p.email
    ),
    'series', v_series
  ) INTO v_result
  FROM public.patients p
  WHERE p.id = v_invoice.patient_id;

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_rectificativa_substitution(p_original_invoice_id uuid, p_series_id uuid, p_recipient jsonb, p_update_patient boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_center uuid := public.get_user_center_id(auth.uid());
  v_original public.invoices%ROWTYPE;
  v_series public.invoice_series%ROWTYPE;
  v_source_type text;
  v_fiscal_type text;
  v_operation public.invoice_correction_operations%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_number text;
  v_financials jsonb;
  v_today date := current_date;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo administradores pueden corregir el tipo de una factura';
  END IF;

  SELECT * INTO v_operation
  FROM public.invoice_correction_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_operation.original_invoice_id <> p_original_invoice_id
      OR v_operation.operation_type <> 'rectificativa_substitution' THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se utilizo para otra operacion';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_operation.resulting_invoice_id;
    RETURN jsonb_build_object(
      'operation_id', v_operation.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_operation.status,
      'already_created', true
    );
  END IF;

  SELECT i.* INTO v_original
  FROM public.invoices i
  WHERE i.id = p_original_invoice_id AND i.center_id = v_center
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Factura original no encontrada'; END IF;
  IF v_original.status NOT IN ('issued', 'paid') OR NOT v_original.is_valid THEN
    RAISE EXCEPTION 'La factura original no es elegible para correccion';
  END IF;
  IF v_original.rectified_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede aplicar esta correccion sobre una rectificativa';
  END IF;
  IF v_original.verifactu_hash IS NULL OR COALESCE(v_original.verifactu_pending, false) THEN
    RAISE EXCEPTION 'La factura original debe estar cerrada fiscalmente y sin envio pendiente';
  END IF;

  SELECT * INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id AND center_id = v_center
  FOR UPDATE;

  IF NOT FOUND OR v_series.series_type <> 'rectifying' OR COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'La serie seleccionada no es una serie rectificativa activa';
  END IF;

  SELECT COALESCE(s.invoice_type, 'complete') INTO v_source_type
  FROM public.invoice_series s WHERE s.id = v_original.series_id;
  v_source_type := COALESCE(v_source_type, 'complete');

  IF v_series.invoice_type <> v_source_type THEN
    RAISE EXCEPTION 'La serie rectificativa debe corresponder al tipo de la factura original';
  END IF;

  v_fiscal_type := CASE WHEN v_source_type = 'simplified' THEN 'R5' ELSE 'R4' END;
  v_invoice_number := public.format_invoice_number_from_series(
    v_series.format, v_series.name, v_series.next_number, v_today
  );

  IF v_fiscal_type = 'R4' AND NULLIF(trim(p_recipient->>'tax_id'), '') IS NULL THEN
    RAISE EXCEPTION 'La rectificativa completa requiere NIF del destinatario';
  END IF;

  INSERT INTO public.invoice_correction_operations (
    center_id, original_invoice_id, operation_type, idempotency_key, requested_by, status
  ) VALUES (
    v_center, v_original.id, 'rectificativa_substitution', p_idempotency_key, v_actor, 'preparing'
  ) RETURNING * INTO v_operation;

  INSERT INTO public.invoices (
    center_id, patient_id, invoice_number, series_id, status, issue_date, due_date,
    subtotal, tax_rate, tax_amount, retention_rate, retention_amount, total,
    is_recapitulative, is_valid, notes, rectified_invoice_id, rectification_type,
    rectification_reason_code, base_rectificada, cuota_rectificada,
    verifactu_invoice_type, operation_date, recipient_snapshot, correction_operation_id
  ) VALUES (
    v_original.center_id, v_original.patient_id, v_invoice_number, v_series.id, 'issued', v_today, v_today,
    v_original.subtotal, v_original.tax_rate, v_original.tax_amount,
    v_original.retention_rate, v_original.retention_amount, v_original.total,
    false, true,
    format('Rectificativa sustitutiva de %s por correccion del tipo de factura', v_original.invoice_number),
    v_original.id, 'substitution', v_fiscal_type,
    v_original.subtotal, COALESCE(v_original.tax_amount, 0),
    v_fiscal_type, COALESCE(v_original.operation_date, v_original.issue_date),
    p_recipient, v_operation.id
  ) RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items (
    invoice_id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  )
  SELECT v_invoice.id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  FROM public.invoice_items
  WHERE invoice_id = v_original.id;

  UPDATE public.invoice_series SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_series.id;

  UPDATE public.invoices SET is_valid = false, updated_at = now()
  WHERE id = v_original.id;

  IF p_update_patient THEN
    UPDATE public.patients
    SET tax_id = COALESCE(NULLIF(trim(p_recipient->>'tax_id'), ''), tax_id),
        address = COALESCE(NULLIF(trim(p_recipient->>'address'), ''), address),
        city = COALESCE(NULLIF(trim(p_recipient->>'city'), ''), city),
        postal_code = COALESCE(NULLIF(trim(p_recipient->>'postal_code'), ''), postal_code),
        updated_at = now()
    WHERE id = v_original.patient_id AND center_id = v_center;
  END IF;

  v_financials := public.move_invoice_financials_for_replacement(v_original.id, v_invoice.id);

  UPDATE public.invoice_correction_operations
  SET resulting_invoice_id = v_invoice.id, status = 'local_created', updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'status', 'local_created',
    'verifactu_invoice_type', v_fiscal_type,
    'rectification_type', 'S',
    'financials', v_financials,
    'already_created', false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_f3_replacement(p_original_invoice_id uuid, p_series_id uuid, p_recipient jsonb, p_update_patient boolean, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_center uuid := public.get_user_center_id(auth.uid());
  v_original public.invoices%ROWTYPE;
  v_series public.invoice_series%ROWTYPE;
  v_source_type text;
  v_operation public.invoice_correction_operations%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_number text;
  v_financials jsonb;
  v_today date := current_date;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo administradores pueden emitir una factura F3';
  END IF;

  SELECT * INTO v_operation
  FROM public.invoice_correction_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_operation.original_invoice_id <> p_original_invoice_id
      OR v_operation.operation_type <> 'f3_replacement' THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se utilizo para otra operacion';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_operation.resulting_invoice_id;
    RETURN jsonb_build_object(
      'operation_id', v_operation.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_operation.status,
      'already_created', true
    );
  END IF;

  SELECT i.* INTO v_original
  FROM public.invoices i
  WHERE i.id = p_original_invoice_id AND i.center_id = v_center
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Factura original no encontrada'; END IF;
  IF v_original.status NOT IN ('issued', 'paid') OR NOT v_original.is_valid THEN
    RAISE EXCEPTION 'La factura original no es elegible para sustitucion F3';
  END IF;
  IF v_original.rectified_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una rectificativa no se puede sustituir mediante F3';
  END IF;
  IF v_original.verifactu_hash IS NULL OR COALESCE(v_original.verifactu_pending, false) THEN
    RAISE EXCEPTION 'La factura original debe estar cerrada fiscalmente y sin envio pendiente';
  END IF;

  SELECT COALESCE(s.invoice_type, 'complete') INTO v_source_type
  FROM public.invoice_series s WHERE s.id = v_original.series_id;
  IF COALESCE(v_source_type, 'complete') <> 'simplified' THEN
    RAISE EXCEPTION 'F3 solo puede sustituir facturas simplificadas validas';
  END IF;

  IF NULLIF(trim(p_recipient->>'name'), '') IS NULL
    OR NULLIF(trim(p_recipient->>'tax_id'), '') IS NULL THEN
    RAISE EXCEPTION 'La factura completa requiere nombre y NIF del destinatario';
  END IF;

  SELECT * INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id AND center_id = v_center
  FOR UPDATE;

  IF NOT FOUND OR v_series.series_type <> 'ordinary'
    OR v_series.invoice_type <> 'complete' OR COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'F3 requiere una serie ordinaria completa activa';
  END IF;

  v_invoice_number := public.format_invoice_number_from_series(
    v_series.format, v_series.name, v_series.next_number, v_today
  );

  INSERT INTO public.invoice_correction_operations (
    center_id, original_invoice_id, operation_type, idempotency_key, requested_by, status
  ) VALUES (
    v_center, v_original.id, 'f3_replacement', p_idempotency_key, v_actor, 'preparing'
  ) RETURNING * INTO v_operation;

  INSERT INTO public.invoices (
    center_id, patient_id, invoice_number, series_id, status, issue_date, due_date,
    subtotal, tax_rate, tax_amount, retention_rate, retention_amount, total,
    is_recapitulative, is_valid, notes, verifactu_invoice_type, operation_date,
    recipient_snapshot, correction_operation_id
  ) VALUES (
    v_original.center_id, v_original.patient_id, v_invoice_number, v_series.id, 'issued', v_today, v_today,
    v_original.subtotal, v_original.tax_rate, v_original.tax_amount,
    v_original.retention_rate, v_original.retention_amount, v_original.total,
    false, true,
    format('Factura completa F3 en sustitucion de %s', v_original.invoice_number),
    'F3', COALESCE(v_original.operation_date, v_original.issue_date),
    p_recipient, v_operation.id
  ) RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items (
    invoice_id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  )
  SELECT v_invoice.id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  FROM public.invoice_items
  WHERE invoice_id = v_original.id;

  INSERT INTO public.invoice_substitutions (
    center_id, replacement_invoice_id, substituted_invoice_id, created_by
  ) VALUES (v_center, v_invoice.id, v_original.id, v_actor);

  UPDATE public.invoice_series SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_series.id;

  UPDATE public.invoices SET is_valid = false, updated_at = now()
  WHERE id = v_original.id;

  IF p_update_patient THEN
    UPDATE public.patients
    SET tax_id = COALESCE(NULLIF(trim(p_recipient->>'tax_id'), ''), tax_id),
        address = COALESCE(NULLIF(trim(p_recipient->>'address'), ''), address),
        city = COALESCE(NULLIF(trim(p_recipient->>'city'), ''), city),
        postal_code = COALESCE(NULLIF(trim(p_recipient->>'postal_code'), ''), postal_code),
        updated_at = now()
    WHERE id = v_original.patient_id AND center_id = v_center;
  END IF;

  v_financials := public.move_invoice_financials_for_replacement(v_original.id, v_invoice.id);

  UPDATE public.invoice_correction_operations
  SET resulting_invoice_id = v_invoice.id, status = 'local_created', updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'status', 'local_created',
    'verifactu_invoice_type', 'F3',
    'financials', v_financials,
    'already_created', false
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_default_invoice_series(p_series_id uuid)
 RETURNS SETOF invoice_series
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_series public.invoice_series;
BEGIN
  SELECT *
  INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serie de facturación no encontrada';
  END IF;

  IF COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'No se puede establecer como predeterminada una serie archivada';
  END IF;

  -- Serialize changes for this center to avoid competing defaults.
  PERFORM pg_advisory_xact_lock(hashtext(
    v_series.center_id::text || ':' || v_series.series_type || ':' || v_series.invoice_type
  ));

  PERFORM 1
  FROM public.invoice_series
  WHERE center_id = v_series.center_id
    AND series_type = v_series.series_type
    AND invoice_type = v_series.invoice_type
  FOR UPDATE;

  UPDATE public.invoice_series
  SET is_default = false
  WHERE center_id = v_series.center_id
    AND series_type = v_series.series_type
    AND invoice_type = v_series.invoice_type
    AND is_archived = false
    AND id <> v_series.id;

  UPDATE public.invoice_series
  SET is_default = true
  WHERE id = v_series.id
  RETURNING * INTO v_series;

  RETURN NEXT v_series;
  RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_invoice_series_document_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_series public.invoice_series;
BEGIN
  IF NEW.series_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Una factura emitida necesita una serie de facturación';
      END IF;
    ELSIF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Una factura emitida necesita una serie de facturación';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_series
  FROM public.invoice_series
  WHERE id = NEW.series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serie de facturación no encontrada';
  END IF;

  IF v_series.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'La serie de facturación pertenece a otro centro';
  END IF;

  IF COALESCE(v_series.is_archived, false) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'No se puede usar una serie de facturación archivada';
    ELSIF NEW.series_id IS DISTINCT FROM OLD.series_id
       OR (OLD.status = 'draft' AND NEW.status <> 'draft') THEN
      RAISE EXCEPTION 'No se puede usar una serie de facturación archivada';
    END IF;
  END IF;

  IF NEW.invoice_type IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.invoice_type := v_series.invoice_type;
    ELSIF OLD.status = 'draft' THEN
      NEW.invoice_type := v_series.invoice_type;
    END IF;
  ELSIF NEW.invoice_type <> v_series.invoice_type THEN
    RAISE EXCEPTION 'El tipo de factura (%) no coincide con el tipo de la serie (%)',
      NEW.invoice_type, v_series.invoice_type;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_type IS NOT NULL AND NEW.invoice_type IS DISTINCT FROM OLD.invoice_type THEN
      RAISE EXCEPTION 'El tipo de una factura no se puede modificar después de crearla';
    END IF;

    IF OLD.status <> 'draft' AND NEW.series_id IS DISTINCT FROM OLD.series_id THEN
      RAISE EXCEPTION 'La serie de una factura emitida no se puede modificar';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_used_invoice_series_classification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.invoice_type, NEW.series_type) IS DISTINCT FROM (OLD.invoice_type, OLD.series_type)
     AND EXISTS (
       SELECT 1
       FROM public.invoices
       WHERE series_id = OLD.id
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de una serie que ya tiene facturas. Archívala y crea una nueva.';
  END IF;

  IF COALESCE(NEW.is_archived, false) AND COALESCE(NEW.is_default, false) THEN
    NEW.is_default := false;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_patient_for_invoice_token(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'tax_id', p.tax_id,
    'address', p.address,
    'city', p.city,
    'postal_code', p.postal_code,
    'email', p.email,
    'phone', p.phone
  )
  FROM public.invoices i
  JOIN public.patients p ON p.id = i.patient_id
  WHERE p_token IS NOT NULL
    AND length(trim(p_token)) > 0
    AND i.access_token = p_token
  LIMIT 1
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_cancellation_charge(p_charge_id uuid, p_amount numeric, p_review_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_charge public.cancellation_charges%ROWTYPE;
  v_debt_id uuid;
  v_notes text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El importe debe ser mayor que 0';
  END IF;

  SELECT *
  INTO v_charge
  FROM public.cancellation_charges
  WHERE id = p_charge_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_charge.center_id <> public.get_user_center_id(auth.uid()) THEN
    RAISE EXCEPTION 'Cargo no encontrado';
  END IF;

  IF v_charge.status IN ('confirmed', 'paid')
     AND v_charge.debt_id IS NOT NULL THEN
    RETURN v_charge.debt_id;
  END IF;

  IF v_charge.status <> 'pending_review' THEN
    RAISE EXCEPTION 'El cargo ya no está pendiente de revisión';
  END IF;

  v_notes := concat_ws(
    E'\n',
    v_charge.concept,
    'Origen: cancelación fuera de plazo según política aceptada.',
    format(
      'Importe revisado: %s EUR. Importe estimado inicial: %s EUR.',
      round(p_amount, 2),
      round(coalesce(v_charge.original_amount, v_charge.amount), 2)
    ),
    format(
      'Cálculo inicial: %s%% de %s EUR.',
      v_charge.percentage,
      v_charge.base_session_price
    ),
    CASE
      WHEN nullif(btrim(p_review_note), '') IS NOT NULL
        THEN 'Resolución profesional: ' || btrim(p_review_note)
      ELSE NULL
    END
  );

  INSERT INTO public.debts (
    center_id,
    patient_id,
    session_id,
    amount,
    paid_amount,
    status,
    notes
  )
  VALUES (
    v_charge.center_id,
    v_charge.patient_id,
    v_charge.session_id,
    round(p_amount, 2),
    0,
    'pending',
    v_notes
  )
  RETURNING id INTO v_debt_id;

  UPDATE public.cancellation_charges
  SET
    status = 'confirmed',
    amount = round(p_amount, 2),
    debt_id = v_debt_id,
    review_note = coalesce(
      nullif(btrim(p_review_note), ''),
      review_note
    ),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE id = p_charge_id;

  RETURN v_debt_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(p_event_id text, p_event_type text, p_connected_account_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event public.stripe_webhook_events%ROWTYPE;
BEGIN
  INSERT INTO public.stripe_webhook_events (
    event_id,
    event_type,
    connected_account_id,
    status
  )
  VALUES (
    p_event_id,
    p_event_type,
    p_connected_account_id,
    'processing'
  )
  ON CONFLICT (event_id) DO NOTHING;

  IF FOUND THEN
    RETURN true;
  END IF;

  SELECT *
  INTO v_event
  FROM public.stripe_webhook_events
  WHERE event_id = p_event_id
  FOR UPDATE;

  IF v_event.status = 'completed'
     OR (
       v_event.status = 'processing'
       AND v_event.updated_at > now() - interval '5 minutes'
     ) THEN
    RETURN false;
  END IF;

  UPDATE public.stripe_webhook_events
  SET
    status = 'processing',
    attempts = attempts + 1,
    last_error = NULL,
    updated_at = now()
  WHERE event_id = p_event_id;

  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_portal_phone(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') LIKE '00%'
      THEN substr(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 3)
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') ~ '^[67][0-9]{8}$'
      THEN '34' || regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    ELSE regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_portal_patient_by_identifier(p_center_id uuid, p_identifier text, p_channel text)
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone
  FROM public.patients p
  WHERE p.center_id = p_center_id
    AND coalesce(p.status::text, 'active') <> 'archived'
    AND (
      (p_channel = 'email' AND lower(trim(coalesce(p.email, ''))) = lower(trim(p_identifier)))
      OR
      (p_channel = 'whatsapp' AND public.normalize_portal_phone(p.phone) = public.normalize_portal_phone(p_identifier))
    )
  ORDER BY
    (coalesce(p.status::text,'active') = 'active') DESC,
    (SELECT max(s.created_at) FROM public.sessions s WHERE s.patient_id = p.id) DESC NULLS LAST,
    p.created_at DESC
  LIMIT 2;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_debt_by_token(p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'id', d.id,
    'amount', d.amount,
    'paid_amount', d.paid_amount,
    'status', d.status,
    'created_at', d.created_at,
    'center_id', d.center_id,
    'patient', jsonb_build_object(
      'first_name', p.first_name,
      'last_name', p.last_name
    ),
    'session', CASE
      WHEN s.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', s.id,
        'session_date', s.session_date,
        'session_type', s.session_type
      )
    END,
    'center', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'bizum_phone', c.bizum_phone,
      'has_stripe', EXISTS (
        SELECT 1
        FROM public.oauth_connections oc
        WHERE oc.professional_id = COALESCE(
          s.professional_id,
          p.assigned_professional_id,
          c.portal_default_professional_id
        )
          AND oc.provider = 'stripe'
          AND oc.stripe_account_id IS NOT NULL
          AND oc.stripe_account_status = 'active'
      )
    )
  )
  FROM public.debts d
  JOIN public.patients p ON p.id = d.patient_id
  JOIN public.centers c ON c.id = d.center_id
  LEFT JOIN public.sessions s ON s.id = d.session_id
  WHERE d.access_token = p_token
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_debt(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.debts d
  JOIN public.bono_templates bt
    ON bt.center_id = d.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public.resolve_effective_price(d.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE d.access_token = p_token
    AND d.status IN ('pending', 'partial');

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.find_debt_id_for_payment(p_payment_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p record;
  v_debt_id uuid;
BEGIN
  SELECT * INTO p FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF p.invoice_id IS NOT NULL THEN
    SELECT d.id INTO v_debt_id
    FROM public.debts d
    WHERE d.invoice_id = p.invoice_id
      AND d.center_id = p.center_id
      AND d.patient_id = p.patient_id
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_debt_id IS NULL AND p.session_id IS NOT NULL THEN
    SELECT d.id INTO v_debt_id
    FROM public.debts d
    WHERE d.session_id = p.session_id
      AND d.center_id = p.center_id
    ORDER BY d.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  RETURN v_debt_id; -- may be NULL
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reassign_payment_to_invoice_v2(p_payment_id uuid, p_target_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_center_id uuid;
  v_payment record;
  v_target_invoice record;
  v_previous_invoice_id uuid;
  v_target_debt_id uuid;
  v_previous_debt_id uuid;
  v_paid_sum numeric;
  v_new_status text;
  v_prev_paid_sum numeric;
  v_prev_new_status text;
BEGIN
  v_user_center_id := get_user_center_id(auth.uid());
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado o sin centro asignado';
  END IF;

  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Permisos insuficientes: requiere rol profesional o admin';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado: %', p_payment_id;
  END IF;
  IF v_payment.center_id != v_user_center_id THEN
    RAISE EXCEPTION 'El pago no pertenece a tu centro';
  END IF;

  v_previous_invoice_id := v_payment.invoice_id;
  IF v_previous_invoice_id = p_target_invoice_id THEN
    RAISE EXCEPTION 'El pago ya esta vinculado a esta factura';
  END IF;

  SELECT * INTO v_target_invoice FROM invoices WHERE id = p_target_invoice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura destino no encontrada: %', p_target_invoice_id;
  END IF;
  IF v_target_invoice.center_id != v_user_center_id THEN
    RAISE EXCEPTION 'La factura destino no pertenece a tu centro';
  END IF;
  IF v_target_invoice.status = 'cancelled' THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura cancelada';
  END IF;
  IF v_target_invoice.status = 'draft' THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura en borrador';
  END IF;
  IF v_target_invoice.is_valid = false THEN
    RAISE EXCEPTION 'No se puede vincular un pago a una factura invalidada por rectificativa. Usa la factura rectificativa valida.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM invoices
    WHERE rectified_invoice_id = p_target_invoice_id
      AND is_valid = true
      AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'La factura destino ha sido sustituida por una rectificativa valida. Reasigna el pago a la factura rectificativa.';
  END IF;

  SELECT id INTO v_target_debt_id FROM debts WHERE invoice_id = p_target_invoice_id LIMIT 1;

  IF v_target_debt_id IS NULL THEN
    INSERT INTO debts (patient_id, center_id, invoice_id, amount, paid_amount, status, notes)
    VALUES (
      v_target_invoice.patient_id,
      v_target_invoice.center_id,
      p_target_invoice_id,
      v_target_invoice.total,
      0,
      'pending',
      'Deuda creada automaticamente al reasignar pago a factura'
    )
    RETURNING id INTO v_target_debt_id;
  END IF;

  UPDATE payments
  SET invoice_id = p_target_invoice_id, updated_at = now()
  WHERE id = p_payment_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum FROM payments WHERE invoice_id = p_target_invoice_id;

  IF v_paid_sum >= v_target_invoice.total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET paid_amount = v_paid_sum,
      status = v_new_status::payment_status,
      amount = v_target_invoice.total,
      updated_at = now()
  WHERE id = v_target_debt_id;

  IF v_new_status = 'paid' THEN
    UPDATE invoices SET status = 'paid', updated_at = now()
    WHERE id = p_target_invoice_id AND status != 'paid';
  ELSE
    UPDATE invoices SET status = 'issued', updated_at = now()
    WHERE id = p_target_invoice_id AND status = 'paid';
  END IF;

  v_prev_new_status := NULL;
  IF v_previous_invoice_id IS NOT NULL THEN
    SELECT id INTO v_previous_debt_id FROM debts WHERE invoice_id = v_previous_invoice_id LIMIT 1;

    IF v_previous_debt_id IS NOT NULL THEN
      SELECT COALESCE(SUM(amount), 0) INTO v_prev_paid_sum FROM payments WHERE invoice_id = v_previous_invoice_id;

      IF EXISTS (SELECT 1 FROM invoices WHERE id = v_previous_invoice_id AND is_valid = false) THEN
        UPDATE debts
        SET paid_amount = v_prev_paid_sum,
            status = 'refunded',
            notes = COALESCE(notes, '') ||
              CASE WHEN notes IS NOT NULL AND notes != '' THEN ' | ' ELSE '' END ||
              'Deuda cerrada: factura invalidada por rectificativa total.',
            updated_at = now()
        WHERE id = v_previous_debt_id;
        v_prev_new_status := 'refunded';
      ELSE
        DECLARE
          v_prev_invoice_total numeric;
        BEGIN
          SELECT total INTO v_prev_invoice_total FROM invoices WHERE id = v_previous_invoice_id;

          IF v_prev_paid_sum >= v_prev_invoice_total THEN
            v_prev_new_status := 'paid';
          ELSIF v_prev_paid_sum > 0 THEN
            v_prev_new_status := 'partial';
          ELSE
            v_prev_new_status := 'pending';
          END IF;

          UPDATE debts
          SET paid_amount = v_prev_paid_sum,
              status = v_prev_new_status::payment_status,
              updated_at = now()
          WHERE id = v_previous_debt_id;

          IF v_prev_new_status = 'paid' THEN
            UPDATE invoices SET status = 'paid', updated_at = now()
            WHERE id = v_previous_invoice_id AND status != 'paid';
          ELSE
            UPDATE invoices SET status = 'issued', updated_at = now()
            WHERE id = v_previous_invoice_id AND status = 'paid';
          END IF;
        END;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'previous_invoice_id', v_previous_invoice_id,
    'target_invoice_id', p_target_invoice_id,
    'target_debt_id', v_target_debt_id,
    'target_paid_amount', v_paid_sum,
    'target_status', v_new_status,
    'previous_debt_id', v_previous_debt_id,
    'previous_debt_status', v_prev_new_status
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_session(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.sessions s
  JOIN public.bono_templates bt
    ON bt.center_id = s.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public.resolve_effective_price(s.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE s.access_token = p_token
    AND s.status <> 'cancelled'
    AND COALESCE(s.payment_status, '') NOT IN ('paid', 'bono')
    AND s.stripe_payment_status IS DISTINCT FROM 'paid';

  RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_default_expense_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.expense_categories (center_id, name, color, icon, is_professional_payment_category, display_order)
  VALUES
    (NEW.id, 'Alquiler',               '#EF4444', 'apartment',   false, 1),
    (NEW.id, 'Suministros',            '#F59E0B', 'bolt',        false, 2),
    (NEW.id, 'Software y licencias',   '#6366F1', 'apps',        false, 3),
    (NEW.id, 'Seguros',                '#0EA5E9', 'shield',      false, 4),
    (NEW.id, 'Formacion',              '#22C55E', 'school',      false, 5),
    (NEW.id, 'Material clinico',       '#14B8A6', 'inventory_2', false, 6),
    (NEW.id, 'Marketing y publicidad', '#EC4899', 'campaign',    false, 7),
    (NEW.id, 'Gestoria y asesoria',    '#8B5CF6', 'gavel',       false, 8),
    (NEW.id, 'Pagos a profesionales',  '#0891B2', 'diversity_3', true,  9),
    (NEW.id, 'Otros gastos',           '#64748B', 'more_horiz',  false, 10);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_professional_payment_category()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_professional_payment_category THEN
      RAISE EXCEPTION 'No se puede eliminar la categoría reservada para pagos a profesionales';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_professional_payment_category
     AND (NEW.is_active = false OR NEW.is_professional_payment_category = false) THEN
    RAISE EXCEPTION 'No se puede desactivar la categoría reservada para pagos a profesionales';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._calculate_professional_variable_amount_internal(p_professional_id uuid, p_center_id uuid, p_period_start date, p_period_end date, p_percentage_rate numeric, p_basis compensation_basis DEFAULT 'collected_payments'::compensation_basis)
 RETURNS TABLE(collected_total numeric, variable_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_basis = 'issued_invoices' THEN
    RETURN QUERY
    WITH direct_session_invoices AS (
      SELECT ii.total AS amount
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      JOIN public.sessions s ON s.id = ii.session_id
      WHERE s.professional_id = p_professional_id
        AND i.center_id = p_center_id
        AND i.status IN ('issued', 'paid')
        AND i.issue_date BETWEEN p_period_start AND p_period_end
    ),
    bono_invoices AS (
      SELECT ii.total
        * (bi_prof.session_count::numeric / NULLIF(bi_all.session_count, 0)) AS amount
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id AND ii.bono_id IS NOT NULL
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items bi
        JOIN public.sessions s ON s.id = bi.session_id
        WHERE s.professional_id = p_professional_id
        GROUP BY bono_id
      ) bi_prof ON bi_prof.bono_id = ii.bono_id
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items
        WHERE session_id IS NOT NULL
        GROUP BY bono_id
      ) bi_all ON bi_all.bono_id = ii.bono_id
      WHERE i.center_id = p_center_id
        AND i.status IN ('issued', 'paid')
        AND i.issue_date BETWEEN p_period_start AND p_period_end
    ),
    totals AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM direct_session_invoices
        UNION ALL SELECT amount FROM bono_invoices
      ) all_amounts
    )
    SELECT totals.total, ROUND(totals.total * COALESCE(p_percentage_rate, 0) / 100, 2)
    FROM totals;
  ELSE
    RETURN QUERY
    WITH direct_session_payments AS (
      SELECT p.amount
      FROM public.payments p
      JOIN public.sessions s ON s.id = p.session_id
      WHERE s.professional_id = p_professional_id
        AND s.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    invoice_session_payments AS (
      SELECT p.amount * (ii.total / NULLIF(inv_total.sum_total, 0)) AS amount
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      JOIN public.invoice_items ii ON ii.invoice_id = i.id
      JOIN public.sessions s ON s.id = ii.session_id
      JOIN (
        SELECT invoice_id, SUM(total) AS sum_total
        FROM public.invoice_items
        GROUP BY invoice_id
      ) inv_total ON inv_total.invoice_id = i.id
      WHERE p.session_id IS NULL
        AND s.professional_id = p_professional_id
        AND i.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    bono_payments AS (
      SELECT p.amount
        * (bi_prof.session_count::numeric / NULLIF(bi_all.session_count, 0)) AS amount
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      JOIN public.invoice_items ii ON ii.invoice_id = i.id AND ii.bono_id IS NOT NULL
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items bi
        JOIN public.sessions s ON s.id = bi.session_id
        WHERE s.professional_id = p_professional_id
        GROUP BY bono_id
      ) bi_prof ON bi_prof.bono_id = ii.bono_id
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items
        WHERE session_id IS NOT NULL
        GROUP BY bono_id
      ) bi_all ON bi_all.bono_id = ii.bono_id
      WHERE p.session_id IS NULL
        AND i.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    totals AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM direct_session_payments
        UNION ALL SELECT amount FROM invoice_session_payments
        UNION ALL SELECT amount FROM bono_payments
      ) all_amounts
    )
    SELECT totals.total, ROUND(totals.total * COALESCE(p_percentage_rate, 0) / 100, 2)
    FROM totals;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.calculate_professional_variable_amount(p_professional_id uuid, p_period_start date, p_period_end date)
 RETURNS TABLE(collected_total numeric, variable_amount numeric, percentage_rate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
  v_rate numeric;
  v_basis public.compensation_basis;
BEGIN
  v_center_id := public.get_user_center_id(auth.uid());
  IF NOT (public.is_admin(auth.uid()) OR auth.uid() = p_professional_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT pca.percentage_rate, pca.compensation_basis INTO v_rate, v_basis
  FROM public.professional_compensation_agreements pca
  WHERE pca.professional_id = p_professional_id
    AND pca.is_active = true
    AND pca.effective_to IS NULL
  LIMIT 1;

  RETURN QUERY
  SELECT calc.collected_total, calc.variable_amount, COALESCE(v_rate, 0)
  FROM public._calculate_professional_variable_amount_internal(
    p_professional_id, v_center_id, p_period_start, p_period_end,
    COALESCE(v_rate, 0), COALESCE(v_basis, 'collected_payments')
  ) calc;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_platform_verifactu_software_info()
 RETURNS TABLE(verifactu_sistema_informatico text, verifactu_software_version text, verifactu_software_nif text, verifactu_software_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT verifactu_sistema_informatico, verifactu_software_version, verifactu_software_nif, verifactu_software_name
  FROM public.centers
  WHERE is_software_provider = true
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_plaud_transcripts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cleared_count integer;
BEGIN
  UPDATE public.plaud_recordings
  SET transcript_text = NULL,
      updated_at = now()
  WHERE transcript_text IS NOT NULL
    AND transcript_expires_at IS NOT NULL
    AND transcript_expires_at < now();

  GET DIAGNOSTICS cleared_count = ROW_COUNT;

  RETURN jsonb_build_object('cleared', cleared_count, 'timestamp', now());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_published_prompt_version_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.is_published = true THEN
    IF NEW.user_prompt IS DISTINCT FROM OLD.user_prompt
      OR NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.temperature IS DISTINCT FROM OLD.temperature
      OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
      OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
      OR NEW.document_type_id IS DISTINCT FROM OLD.document_type_id
      OR NEW.version IS DISTINCT FROM OLD.version
    THEN
      RAISE EXCEPTION 'No se puede modificar una versión de prompt ya publicada. Crea una nueva versión en su lugar.';
    END IF;

    IF NEW.is_published = false THEN
      RAISE EXCEPTION 'No se puede despublicar una versión de prompt. Publica otra versión para reemplazarla.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_ai_prompt_versions_for_center(p_center_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_prompt_system text;
  v_ai_prompt_layer1 text;
  v_ai_prompt_layer2 text;
  v_ai_prompt_layer3 text;
BEGIN
  SELECT c.ai_prompt_system, c.ai_prompt_layer1, c.ai_prompt_layer2, c.ai_prompt_layer3
  INTO v_ai_prompt_system, v_ai_prompt_layer1, v_ai_prompt_layer2, v_ai_prompt_layer3
  FROM public.centers c
  WHERE c.id = p_center_id;

  INSERT INTO public.ai_prompt_versions
    (document_type_id, center_id, version, system_prompt, user_prompt, professional_id, session_type_id, is_published)
  SELECT
    dt.id,
    p_center_id,
    1,
    v_ai_prompt_system,
    CASE dt.key
      WHEN 'base_extraction' THEN coalesce(v_ai_prompt_layer1, dt.default_user_prompt)
      WHEN 'clinical_report' THEN coalesce(v_ai_prompt_layer2, dt.default_user_prompt)
      WHEN 'patient_report'  THEN coalesce(v_ai_prompt_layer3, dt.default_user_prompt)
      ELSE dt.default_user_prompt
    END,
    NULL,
    NULL,
    true
  FROM public.ai_document_types dt
  WHERE dt.center_id IS NULL
    AND dt.is_active = true
    AND dt.default_user_prompt IS NOT NULL
  ON CONFLICT (document_type_id, center_id, version) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_seed_ai_prompt_versions_for_new_center()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.seed_ai_prompt_versions_for_center(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudieron sembrar las versiones de prompt para el centro % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.seed_ai_document_defaults_for_center(p_center_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinical_report_id uuid;
  v_patient_report_id  uuid;
BEGIN
  SELECT id INTO v_clinical_report_id
    FROM public.ai_document_types WHERE center_id IS NULL AND key = 'clinical_report';
  SELECT id INTO v_patient_report_id
    FROM public.ai_document_types WHERE center_id IS NULL AND key = 'patient_report';

  IF v_clinical_report_id IS NOT NULL THEN
    INSERT INTO public.ai_document_defaults (center_id, professional_id, audience, document_type_id)
    VALUES (p_center_id, NULL, 'professional', v_clinical_report_id)
    ON CONFLICT (center_id, coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), audience)
    DO NOTHING;
  END IF;

  IF v_patient_report_id IS NOT NULL THEN
    INSERT INTO public.ai_document_defaults (center_id, professional_id, audience, document_type_id)
    VALUES (p_center_id, NULL, 'patient', v_patient_report_id)
    ON CONFLICT (center_id, coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), audience)
    DO NOTHING;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_seed_ai_document_defaults_for_new_center()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  BEGIN
    PERFORM public.seed_ai_document_defaults_for_center(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudieron sembrar las predeterminadas de documentos IA para el centro % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE VIEW public.centers_public AS  SELECT id,
    name,
    address,
    address_details,
    city,
    postal_code,
    province,
    country,
    logo_url,
    portal_slug,
    portal_enabled,
    portal_require_approval,
    portal_allow_professional_selection,
    public_booking_enabled,
    reschedule_max_days,
    reschedule_slot_duration,
    reschedule_require_confirmation,
    consent_expiration_days
   FROM centers c
  WHERE portal_enabled = true;

CREATE OR REPLACE VIEW public.oauth_connections_safe AS  SELECT id,
    professional_id,
    provider,
    expires_at,
    scope,
    provider_account_id,
    stripe_account_id,
    stripe_account_status,
    google_calendar_id,
    created_at,
    updated_at,
    watch_channel_id,
    watch_resource_id,
    watch_expires_at,
    last_sync_at,
    last_sync_status,
    needs_reconnect,
    consecutive_sync_errors,
    last_sync_error_code,
    last_sync_error_message
   FROM oauth_connections;

CREATE OR REPLACE VIEW public.patients_public AS  SELECT id,
    center_id,
    first_name,
    last_name,
    is_minor
   FROM patients;

CREATE OR REPLACE VIEW public.portal_centers AS  SELECT id,
    name,
    logo_url,
    city,
    province,
    country,
    portal_enabled,
    portal_require_approval,
    portal_allow_professional_selection,
    portal_default_professional_id,
    reschedule_max_days,
    reschedule_slot_duration,
    reschedule_require_confirmation,
    portal_slug,
    public_booking_enabled
   FROM centers;

CREATE OR REPLACE VIEW public.profiles_public AS  SELECT id,
    center_id,
    first_name,
    last_name,
    specialty,
    is_active,
    avatar_url
   FROM profiles;

ALTER TABLE public.ai_document_defaults ADD CONSTRAINT ai_document_defaults_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_document_types ADD CONSTRAINT ai_document_types_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_document_types ADD CONSTRAINT ai_document_types_professional_requires_center_chk CHECK (((professional_id IS NULL) OR (center_id IS NOT NULL)));

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_pkey PRIMARY KEY (id);

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_document_type_id_center_id_version_key UNIQUE (document_type_id, center_id, version);

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.app_change_log ADD CONSTRAINT app_change_log_change_type_check CHECK ((change_type = ANY (ARRAY['feature'::text, 'improvement'::text, 'fix'::text, 'technical'::text, 'legal'::text, 'security'::text, 'ui'::text])));

ALTER TABLE public.app_change_log ADD CONSTRAINT app_change_log_pkey PRIMARY KEY (id);

ALTER TABLE public.app_change_log ADD CONSTRAINT app_change_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'included'::text, 'archived'::text])));

ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));

ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_version_code_key UNIQUE (version_code);

ALTER TABLE public.assessment_responses ADD CONSTRAINT assessment_responses_assessment_id_key UNIQUE (assessment_id);

ALTER TABLE public.assessment_responses ADD CONSTRAINT assessment_responses_pkey PRIMARY KEY (id);

ALTER TABLE public.assessment_templates ADD CONSTRAINT assessment_templates_center_id_code_key UNIQUE (center_id, code);

ALTER TABLE public.assessment_templates ADD CONSTRAINT assessment_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.assessments ADD CONSTRAINT assessments_access_token_key UNIQUE (access_token);

ALTER TABLE public.assessments ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_status_check CHECK ((status = ANY (ARRAY['success'::text, 'denied'::text, 'failed'::text])));

ALTER TABLE public.autoregistro_alert_logs ADD CONSTRAINT autoregistro_alert_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT autoregistro_alert_rules_pkey PRIMARY KEY (id);

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT chk_consecutive_count CHECK ((consecutive_count >= 1));

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT chk_logic_operator CHECK ((logic_operator = ANY (ARRAY['AND'::text, 'OR'::text])));

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT chk_severity CHECK ((severity = ANY (ARRAY['warning'::text, 'critical'::text])));

ALTER TABLE public.autoregistro_entries ADD CONSTRAINT autoregistro_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.autoregistro_links ADD CONSTRAINT autoregistro_links_pkey PRIMARY KEY (id);

ALTER TABLE public.autoregistro_templates ADD CONSTRAINT autoregistro_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.availability ADD CONSTRAINT availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));

ALTER TABLE public.availability ADD CONSTRAINT availability_pkey PRIMARY KEY (id);

ALTER TABLE public.billable_events ADD CONSTRAINT billable_events_billing_status_check CHECK ((billing_status = ANY (ARRAY['pending'::text, 'settled'::text])));

ALTER TABLE public.billable_events ADD CONSTRAINT billable_events_pkey PRIMARY KEY (id);

ALTER TABLE public.bono_items ADD CONSTRAINT bono_items_pkey PRIMARY KEY (id);

ALTER TABLE public.bono_templates ADD CONSTRAINT bono_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.bonos ADD CONSTRAINT bonos_pkey PRIMARY KEY (id);

ALTER TABLE public.bonos ADD CONSTRAINT bonos_pricing_source_check CHECK ((pricing_source = ANY (ARRAY['base'::text, 'custom'::text, 'tariff_plan'::text])));

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_professional_id_provider_google_event_id_key UNIQUE (professional_id, provider, google_event_id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_provider_check CHECK ((provider = 'google'::text));

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_pkey PRIMARY KEY (id);

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_status_check CHECK ((status = ANY (ARRAY['pending_review'::text, 'confirmed'::text, 'forgiven'::text, 'paid'::text, 'cancelled'::text])));

ALTER TABLE public.cancellation_policy_versions ADD CONSTRAINT cancellation_policy_versions_center_id_version_number_key UNIQUE (center_id, version_number);

ALTER TABLE public.cancellation_policy_versions ADD CONSTRAINT cancellation_policy_versions_pkey PRIMARY KEY (id);

ALTER TABLE public.center_drive_connections ADD CONSTRAINT center_drive_connections_pkey PRIMARY KEY (center_id);

ALTER TABLE public.center_locations ADD CONSTRAINT center_locations_pkey PRIMARY KEY (id);

ALTER TABLE public.center_plaud_connections ADD CONSTRAINT center_plaud_connections_pkey PRIMARY KEY (center_id);

ALTER TABLE public.centers ADD CONSTRAINT centers_card_on_booking_mode_check CHECK ((card_on_booking_mode = ANY (ARRAY['off'::text, 'optional'::text, 'required'::text])));

ALTER TABLE public.centers ADD CONSTRAINT centers_pkey PRIMARY KEY (id);

ALTER TABLE public.centers ADD CONSTRAINT centers_portal_slug_key UNIQUE (portal_slug);

ALTER TABLE public.centers ADD CONSTRAINT centers_whatsapp_send_method_check CHECK ((whatsapp_send_method = ANY (ARRAY['web'::text, 'api'::text])));

ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_center_id_channel_template_type_key UNIQUE (center_id, channel, template_type);

ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'whatsapp'::text, 'sms'::text])));

ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_template_type_check CHECK ((template_type = ANY (ARRAY['notification'::text, 'reminder'::text, 'payment_reminder'::text, 'booking_created_patient'::text, 'booking_created_professional'::text, 'booking_rescheduled_patient'::text, 'booking_rescheduled_professional'::text, 'booking_cancelled_patient'::text, 'booking_cancelled_professional'::text])));

ALTER TABLE public.consent_signatures ADD CONSTRAINT consent_signatures_pkey PRIMARY KEY (id);

ALTER TABLE public.consent_signatures ADD CONSTRAINT consent_signatures_signer_role_check CHECK ((signer_role = ANY (ARRAY['patient'::text, 'guardian'::text])));

ALTER TABLE public.consent_templates ADD CONSTRAINT consent_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.consents ADD CONSTRAINT consents_access_token_key UNIQUE (access_token);

ALTER TABLE public.consents ADD CONSTRAINT consents_pkey PRIMARY KEY (id);

ALTER TABLE public.debts ADD CONSTRAINT debts_pkey PRIMARY KEY (id);

ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_pkey PRIMARY KEY (id);

ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'suppressed'::text, 'failed'::text, 'bounced'::text, 'complained'::text, 'dlq'::text])));

ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_id_check CHECK ((id = 1));

ALTER TABLE public.email_send_state ADD CONSTRAINT email_send_state_pkey PRIMARY KEY (id);

ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_email_key UNIQUE (email);

ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_pkey PRIMARY KEY (id);

ALTER TABLE public.email_unsubscribe_tokens ADD CONSTRAINT email_unsubscribe_tokens_token_key UNIQUE (token);

ALTER TABLE public.emotional_records ADD CONSTRAINT emotional_records_pkey PRIMARY KEY (id);

ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_center_id_name_key UNIQUE (center_id, name);

ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_anchor_month_check CHECK (((anchor_month >= 1) AND (anchor_month <= 12)));

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_day_of_period_check CHECK (((day_of_period >= 1) AND (day_of_period <= 28)));

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_default_amount_check CHECK ((default_amount >= (0)::numeric));

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_pkey PRIMARY KEY (id);

ALTER TABLE public.expenses ADD CONSTRAINT expenses_ai_extraction_status_check CHECK ((ai_extraction_status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])));

ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_check CHECK ((amount >= (0)::numeric));

ALTER TABLE public.expenses ADD CONSTRAINT expenses_paid_amount_check CHECK ((paid_amount >= (0)::numeric));

ALTER TABLE public.expenses ADD CONSTRAINT expenses_paid_amount_not_over_amount CHECK ((paid_amount <= (amount + 0.01)));

ALTER TABLE public.expenses ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);

ALTER TABLE public.expenses ADD CONSTRAINT expenses_professional_payment_requires_professional CHECK (((kind <> 'professional_payment'::expense_kind) OR (professional_id IS NOT NULL)));

ALTER TABLE public.google_calendar_channels ADD CONSTRAINT google_calendar_channels_channel_id_key UNIQUE (channel_id);

ALTER TABLE public.google_calendar_channels ADD CONSTRAINT google_calendar_channels_pkey PRIMARY KEY (id);

ALTER TABLE public.google_calendar_channels ADD CONSTRAINT google_calendar_channels_professional_id_calendar_id_key UNIQUE (professional_id, calendar_id);

ALTER TABLE public.google_session_sync_state ADD CONSTRAINT google_session_sync_state_pkey PRIMARY KEY (session_id);

ALTER TABLE public.google_session_sync_state ADD CONSTRAINT google_session_sync_state_status_check CHECK ((status = ANY (ARRAY['synced'::text, 'conflict'::text, 'error'::text])));

ALTER TABLE public.google_sync_debounce ADD CONSTRAINT google_sync_debounce_pkey PRIMARY KEY (professional_id);

ALTER TABLE public.google_sync_locks ADD CONSTRAINT google_sync_locks_pkey PRIMARY KEY (professional_id);

ALTER TABLE public.integration_errors ADD CONSTRAINT integration_errors_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_operation_type_check CHECK ((operation_type = ANY (ARRAY['rectificativa_substitution'::text, 'f3_replacement'::text])));

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_original_invoice_id_key UNIQUE (original_invoice_id);

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_status_check CHECK ((status = ANY (ARRAY['preparing'::text, 'local_created'::text, 'registering'::text, 'registered'::text, 'pending_aeat'::text, 'rejected'::text, 'manual_review'::text])));

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_series ADD CONSTRAINT invoice_series_invoice_type_check CHECK ((invoice_type = ANY (ARRAY['simplified'::text, 'complete'::text])));

ALTER TABLE public.invoice_series ADD CONSTRAINT invoice_series_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_series ADD CONSTRAINT invoice_series_series_type_check CHECK ((series_type = ANY (ARRAY['ordinary'::text, 'rectifying'::text])));

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_check CHECK ((replacement_invoice_id <> substituted_invoice_id));

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_replacement_invoice_id_substituted_in_key UNIQUE (replacement_invoice_id, substituted_invoice_id);

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_substituted_invoice_id_key UNIQUE (substituted_invoice_id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check CHECK (((invoice_type IS NULL) OR (invoice_type = ANY (ARRAY['simplified'::text, 'complete'::text]))));

ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_rectification_type_check CHECK ((rectification_type = ANY (ARRAY['substitution'::text, 'differences'::text])));

ALTER TABLE public.invoices ADD CONSTRAINT invoices_verifactu_invoice_type_check CHECK (((verifactu_invoice_type IS NULL) OR (verifactu_invoice_type = ANY (ARRAY['F1'::text, 'F2'::text, 'F3'::text, 'R1'::text, 'R2'::text, 'R3'::text, 'R4'::text, 'R5'::text]))));

ALTER TABLE public.location_schedules ADD CONSTRAINT location_schedules_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)));

ALTER TABLE public.location_schedules ADD CONSTRAINT location_schedules_location_id_day_of_week_key UNIQUE (location_id, day_of_week);

ALTER TABLE public.location_schedules ADD CONSTRAINT location_schedules_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_purpose_check CHECK ((purpose = 'clinical_report'::text));

ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_professional_id_provider_key UNIQUE (professional_id, provider);

ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_provider_check CHECK ((provider = ANY (ARRAY['google'::text, 'zoom'::text, 'stripe'::text])));

ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_stripe_account_status_check CHECK ((stripe_account_status = ANY (ARRAY['pending'::text, 'active'::text, 'restricted'::text, 'disabled'::text])));

ALTER TABLE public.patient_custom_price_history ADD CONSTRAINT patient_custom_price_history_change_type_check CHECK ((change_type = ANY (ARRAY['created'::text, 'updated'::text, 'deactivated'::text, 'expired'::text])));

ALTER TABLE public.patient_custom_price_history ADD CONSTRAINT patient_custom_price_history_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_custom_price_check CHECK ((custom_price >= (0)::numeric));

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_target_type_check CHECK ((target_type = ANY (ARRAY['session_type'::text, 'bono_template'::text])));

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT pcp_end_after_start CHECK (((end_date IS NULL) OR (end_date >= start_date)));

ALTER TABLE public.patient_magic_links ADD CONSTRAINT patient_magic_links_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_magic_links ADD CONSTRAINT patient_magic_links_token_key UNIQUE (token);

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_status_check CHECK ((status = ANY (ARRAY['active'::text, 'removed'::text, 'expired'::text])));

ALTER TABLE public.patient_portal_accounts ADD CONSTRAINT patient_portal_accounts_patient_id_key UNIQUE (patient_id);

ALTER TABLE public.patient_portal_accounts ADD CONSTRAINT patient_portal_accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_portal_otp_codes ADD CONSTRAINT patient_portal_otp_codes_channel_check CHECK ((channel = ANY (ARRAY['whatsapp'::text, 'email'::text])));

ALTER TABLE public.patient_portal_otp_codes ADD CONSTRAINT patient_portal_otp_codes_failed_attempts_check CHECK ((failed_attempts >= 0));

ALTER TABLE public.patient_portal_otp_codes ADD CONSTRAINT patient_portal_otp_codes_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_access_token_key UNIQUE (access_token);

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT patient_tariff_plan_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT ptpa_end_after_start CHECK (((end_date IS NULL) OR (end_date >= start_date)));

ALTER TABLE public.patients ADD CONSTRAINT patients_payment_mode_check CHECK (((payment_mode IS NULL) OR (payment_mode = ANY (ARRAY['required_now'::text, 'in_session'::text, 'post_session'::text, 'scheduled_before'::text]))));

ALTER TABLE public.patients ADD CONSTRAINT patients_pkey PRIMARY KEY (id);

ALTER TABLE public.patients ADD CONSTRAINT patients_preferred_invoice_type_check CHECK ((preferred_invoice_type = ANY (ARRAY['simplified'::text, 'complete'::text])));

ALTER TABLE public.patients ADD CONSTRAINT patients_status_source_check CHECK ((status_source = ANY (ARRAY['manual'::text, 'auto'::text])));

ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

ALTER TABLE public.payments ADD CONSTRAINT payments_refunded_amount_valid CHECK (((refunded_amount >= (0)::numeric) AND (refunded_amount <= amount)));

ALTER TABLE public.plaud_oauth_states ADD CONSTRAINT plaud_oauth_states_pkey PRIMARY KEY (state);

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_center_id_plaud_file_id_key UNIQUE (center_id, plaud_file_id);

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_matched_by_check CHECK ((matched_by = ANY (ARRAY['auto'::text, 'manual'::text])));

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_pkey PRIMARY KEY (id);

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'matched'::text, 'needs_review'::text, 'ignored'::text, 'processed'::text, 'error'::text])));

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_modality_check CHECK ((modality = ANY (ARRAY['online'::text, 'presencial'::text])));

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_request_type_check CHECK ((request_type = ANY (ARRAY['waitlist'::text, 'referral'::text])));

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'contacted'::text, 'converted'::text, 'cancelled'::text])));

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_percentage_rate_check CHECK (((percentage_rate >= (0)::numeric) AND (percentage_rate <= (100)::numeric)));

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_fixed_amount_check CHECK ((fixed_amount >= (0)::numeric));

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_pkey PRIMARY KEY (id);

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_conflict_mode_check CHECK ((google_calendar_conflict_mode = ANY (ARRAY['psycma_wins'::text, 'safe_two_way'::text, 'google_wins_legacy'::text])));

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_default_video_provider_check CHECK ((default_video_provider = ANY (ARRAY['none'::text, 'zoom'::text, 'google_meet'::text])));

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_google_calendar_sync_mode_check CHECK ((google_calendar_sync_mode = ANY (ARRAY['one_way'::text, 'two_way'::text])));

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_pkey PRIMARY KEY (id);

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_professional_id_key UNIQUE (professional_id);

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_stripe_payment_mode_check CHECK (((stripe_payment_mode IS NULL) OR (stripe_payment_mode = ANY (ARRAY['required_now'::text, 'post_session'::text, 'scheduled_before'::text]))));

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_whatsapp_send_method_check CHECK ((whatsapp_send_method = ANY (ARRAY['web'::text, 'api'::text])));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.public_short_links ADD CONSTRAINT public_short_links_code_key UNIQUE (code);

ALTER TABLE public.public_short_links ADD CONSTRAINT public_short_links_pkey PRIMARY KEY (id);

ALTER TABLE public.public_short_links ADD CONSTRAINT public_short_links_target_type_check CHECK ((target_type = ANY (ARRAY['session'::text, 'session_payment'::text, 'debt'::text, 'debt_bono'::text, 'invoice'::text])));

ALTER TABLE public.public_short_links ADD CONSTRAINT public_short_links_target_type_target_token_key UNIQUE (target_type, target_token);

ALTER TABLE public.rate_limit_log ADD CONSTRAINT rate_limit_log_pkey PRIMARY KEY (id);

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_partner_requests ADD CONSTRAINT referral_partner_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_partner_requests ADD CONSTRAINT referral_partner_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));

ALTER TABLE public.referral_partners ADD CONSTRAINT referral_partners_pkey PRIMARY KEY (id);

ALTER TABLE public.referral_specialties ADD CONSTRAINT referral_specialties_pkey PRIMARY KEY (id);

ALTER TABLE public.schedule_exceptions ADD CONSTRAINT schedule_exceptions_pkey PRIMARY KEY (id);

ALTER TABLE public.schedule_exceptions ADD CONSTRAINT valid_scope CHECK ((((scope = 'center'::schedule_exception_scope) AND (professional_id IS NULL)) OR ((scope = 'professional'::schedule_exception_scope) AND (professional_id IS NOT NULL))));

ALTER TABLE public.session_types ADD CONSTRAINT session_types_pkey PRIMARY KEY (id);

ALTER TABLE public.sessions ADD CONSTRAINT sessions_access_token_key UNIQUE (access_token);

ALTER TABLE public.sessions ADD CONSTRAINT sessions_cancellation_origin_check CHECK (((cancellation_origin IS NULL) OR (cancellation_origin = ANY (ARRAY['patient'::text, 'professional'::text, 'system'::text]))));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_cancellation_policy_status_check CHECK (((cancellation_policy_status IS NULL) OR (cancellation_policy_status = ANY (ARRAY['signed'::text, 'not_signed'::text, 'pending_signature'::text, 'outdated'::text]))));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_payment_mode_check CHECK (((payment_mode IS NULL) OR (payment_mode = ANY (ARRAY['required_now'::text, 'in_session'::text, 'post_session'::text, 'scheduled_before'::text]))));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.sessions ADD CONSTRAINT sessions_pricing_source_check CHECK ((pricing_source = ANY (ARRAY['base'::text, 'custom'::text, 'tariff_plan'::text])));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_stripe_payment_mode_check CHECK (((stripe_payment_mode IS NULL) OR (stripe_payment_mode = ANY (ARRAY['required_now'::text, 'post_session'::text, 'scheduled_before'::text]))));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_stripe_payment_status_check CHECK ((stripe_payment_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'expired'::text, 'refunded'::text])));

ALTER TABLE public.sessions ADD CONSTRAINT sessions_video_provider_check CHECK ((video_provider = ANY (ARRAY['none'::text, 'zoom'::text, 'google_meet'::text])));

ALTER TABLE public.special_day_slots ADD CONSTRAINT special_day_slots_pkey PRIMARY KEY (id);

ALTER TABLE public.special_day_slots ADD CONSTRAINT special_day_slots_valid_range CHECK ((end_time > start_time));

ALTER TABLE public.special_days ADD CONSTRAINT special_days_no_overlap_center EXCLUDE USING gist (center_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&) WHERE ((scope = 'center'::special_day_scope));

ALTER TABLE public.special_days ADD CONSTRAINT special_days_no_overlap_professional EXCLUDE USING gist (center_id WITH =, professional_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&) WHERE (((scope = 'professional'::special_day_scope) AND (professional_id IS NOT NULL)));

ALTER TABLE public.special_days ADD CONSTRAINT special_days_pkey PRIMARY KEY (id);

ALTER TABLE public.special_days ADD CONSTRAINT special_days_valid_dates CHECK ((end_date >= start_date));

ALTER TABLE public.special_days ADD CONSTRAINT special_days_valid_scope CHECK ((((scope = 'center'::special_day_scope) AND (professional_id IS NULL)) OR ((scope = 'professional'::special_day_scope) AND (professional_id IS NOT NULL))));

ALTER TABLE public.stripe_webhook_events ADD CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (event_id);

ALTER TABLE public.stripe_webhook_events ADD CONSTRAINT stripe_webhook_events_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])));

ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);

ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_email_key UNIQUE (email);

ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_pkey PRIMARY KEY (id);

ALTER TABLE public.suppressed_emails ADD CONSTRAINT suppressed_emails_reason_check CHECK ((reason = ANY (ARRAY['unsubscribe'::text, 'bounce'::text, 'complaint'::text])));

ALTER TABLE public.tariff_plan_items ADD CONSTRAINT tariff_plan_items_pkey PRIMARY KEY (id);

ALTER TABLE public.tariff_plan_items ADD CONSTRAINT tariff_plan_items_price_check CHECK ((price >= (0)::numeric));

ALTER TABLE public.tariff_plan_items ADD CONSTRAINT tariff_plan_items_target_type_check CHECK ((target_type = ANY (ARRAY['session_type'::text, 'bono_template'::text])));

ALTER TABLE public.tariff_plan_items ADD CONSTRAINT tpi_unique_product UNIQUE (tariff_plan_id, target_type, target_id);

ALTER TABLE public.tariff_plans ADD CONSTRAINT tariff_plans_pkey PRIMARY KEY (id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_unique_per_center UNIQUE (user_id, center_id, role);

ALTER TABLE public.verifactu_chain_status ADD CONSTRAINT verifactu_chain_status_pkey PRIMARY KEY (id);

ALTER TABLE public.verifactu_chain_status ADD CONSTRAINT verifactu_chain_unique UNIQUE (center_id, nif_emisor, id_sistema_informatico, numero_instalacion);

ALTER TABLE public.verifactu_events ADD CONSTRAINT verifactu_events_environment_check CHECK ((environment = ANY (ARRAY['test'::text, 'production'::text])));

ALTER TABLE public.verifactu_events ADD CONSTRAINT verifactu_events_event_type_check CHECK ((event_type = ANY (ARRAY['alta'::text, 'anulacion'::text, 'consulta'::text, 'error'::text, 'reintento'::text])));

ALTER TABLE public.verifactu_events ADD CONSTRAINT verifactu_events_pkey PRIMARY KEY (id);

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_aeat_status_check CHECK ((aeat_status = ANY (ARRAY['accepted'::text, 'rejected'::text, 'pending'::text, 'error'::text])));

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_environment_check CHECK ((environment = ANY (ARRAY['test'::text, 'production'::text])));

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_pkey PRIMARY KEY (id);

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_record_type_check CHECK ((record_type = ANY (ARRAY['alta'::text, 'anulacion'::text])));

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_direction_check CHECK ((direction = ANY (ARRAY['incoming'::text, 'outgoing'::text])));

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'queued'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'failed'::text, 'played'::text])));

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_type_check CHECK ((type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'document'::text, 'template'::text])));

ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_pkey PRIMARY KEY (id);

ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));

ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_center_id_key UNIQUE (center_id);

ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_status_check CHECK ((status = ANY (ARRAY['disconnected'::text, 'connecting'::text, 'need_scan'::text, 'connected'::text, 'expired'::text])));

ALTER TABLE public.ai_document_defaults ADD CONSTRAINT ai_document_defaults_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.ai_document_defaults ADD CONSTRAINT ai_document_defaults_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES ai_document_types(id) ON DELETE CASCADE;

ALTER TABLE public.ai_document_defaults ADD CONSTRAINT ai_document_defaults_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ai_document_defaults ADD CONSTRAINT ai_document_defaults_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);

ALTER TABLE public.ai_document_types ADD CONSTRAINT ai_document_types_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.ai_document_types ADD CONSTRAINT ai_document_types_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES ai_document_types(id);

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES profiles(id);

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES ai_prompt_versions(id) ON DELETE SET NULL;

ALTER TABLE public.ai_generated_documents ADD CONSTRAINT ai_generated_documents_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_document_type_id_fkey FOREIGN KEY (document_type_id) REFERENCES ai_document_types(id) ON DELETE CASCADE;

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.ai_prompt_versions ADD CONSTRAINT ai_prompt_versions_session_type_id_fkey FOREIGN KEY (session_type_id) REFERENCES session_types(id) ON DELETE CASCADE;

ALTER TABLE public.app_change_log ADD CONSTRAINT app_change_log_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.app_change_log ADD CONSTRAINT app_change_log_version_id_fkey FOREIGN KEY (version_id) REFERENCES app_versions(id) ON DELETE SET NULL;

ALTER TABLE public.app_versions ADD CONSTRAINT app_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.assessment_responses ADD CONSTRAINT assessment_responses_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE;

ALTER TABLE public.assessment_templates ADD CONSTRAINT assessment_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.assessments ADD CONSTRAINT assessments_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.assessments ADD CONSTRAINT assessments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.assessments ADD CONSTRAINT assessments_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.assessments ADD CONSTRAINT assessments_template_id_fkey FOREIGN KEY (template_id) REFERENCES assessment_templates(id) ON DELETE RESTRICT;

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES centers(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.autoregistro_alert_logs ADD CONSTRAINT autoregistro_alert_logs_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_alert_logs ADD CONSTRAINT autoregistro_alert_logs_entry_id_fkey FOREIGN KEY (entry_id) REFERENCES autoregistro_entries(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_alert_logs ADD CONSTRAINT autoregistro_alert_logs_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_alert_logs ADD CONSTRAINT autoregistro_alert_logs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES autoregistro_alert_rules(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT autoregistro_alert_rules_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_alert_rules ADD CONSTRAINT autoregistro_alert_rules_template_id_fkey FOREIGN KEY (template_id) REFERENCES autoregistro_templates(id) ON DELETE CASCADE;

ALTER TABLE public.autoregistro_entries ADD CONSTRAINT autoregistro_entries_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id);

ALTER TABLE public.autoregistro_entries ADD CONSTRAINT autoregistro_entries_link_id_fkey FOREIGN KEY (link_id) REFERENCES autoregistro_links(id);

ALTER TABLE public.autoregistro_entries ADD CONSTRAINT autoregistro_entries_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);

ALTER TABLE public.autoregistro_entries ADD CONSTRAINT autoregistro_entries_template_id_fkey FOREIGN KEY (template_id) REFERENCES autoregistro_templates(id);

ALTER TABLE public.autoregistro_links ADD CONSTRAINT autoregistro_links_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id);

ALTER TABLE public.autoregistro_links ADD CONSTRAINT autoregistro_links_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id);

ALTER TABLE public.autoregistro_links ADD CONSTRAINT autoregistro_links_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id);

ALTER TABLE public.autoregistro_links ADD CONSTRAINT autoregistro_links_template_id_fkey FOREIGN KEY (template_id) REFERENCES autoregistro_templates(id);

ALTER TABLE public.autoregistro_templates ADD CONSTRAINT autoregistro_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id);

ALTER TABLE public.autoregistro_templates ADD CONSTRAINT autoregistro_templates_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id);

ALTER TABLE public.availability ADD CONSTRAINT availability_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.availability ADD CONSTRAINT availability_session_type_id_fkey FOREIGN KEY (session_type_id) REFERENCES session_types(id) ON DELETE SET NULL;

ALTER TABLE public.billable_events ADD CONSTRAINT billable_events_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.billable_events ADD CONSTRAINT billable_events_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.billable_events ADD CONSTRAINT billable_events_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.bono_items ADD CONSTRAINT bono_items_bono_id_fkey FOREIGN KEY (bono_id) REFERENCES bonos(id) ON DELETE CASCADE;

ALTER TABLE public.bono_items ADD CONSTRAINT bono_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.bono_templates ADD CONSTRAINT bono_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.bonos ADD CONSTRAINT bonos_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.bonos ADD CONSTRAINT bonos_custom_price_id_fkey FOREIGN KEY (custom_price_id) REFERENCES patient_custom_prices(id);

ALTER TABLE public.bonos ADD CONSTRAINT bonos_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.bonos ADD CONSTRAINT bonos_template_id_fkey FOREIGN KEY (template_id) REFERENCES bono_templates(id);

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_converted_session_id_fkey FOREIGN KEY (converted_session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.calendar_events ADD CONSTRAINT calendar_events_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_debt_id_fkey FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE SET NULL;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_policy_version_id_fkey FOREIGN KEY (policy_version_id) REFERENCES cancellation_policy_versions(id) ON DELETE SET NULL;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.cancellation_charges ADD CONSTRAINT cancellation_charges_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.cancellation_policy_versions ADD CONSTRAINT cancellation_policy_versions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.cancellation_policy_versions ADD CONSTRAINT cancellation_policy_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.center_drive_connections ADD CONSTRAINT center_drive_connections_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.center_drive_connections ADD CONSTRAINT center_drive_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.center_locations ADD CONSTRAINT center_locations_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.center_plaud_connections ADD CONSTRAINT center_plaud_connections_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.center_plaud_connections ADD CONSTRAINT center_plaud_connections_connected_by_fkey FOREIGN KEY (connected_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.centers ADD CONSTRAINT centers_portal_default_professional_id_fkey FOREIGN KEY (portal_default_professional_id) REFERENCES profiles(id);

ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.consent_signatures ADD CONSTRAINT consent_signatures_consent_id_fkey FOREIGN KEY (consent_id) REFERENCES consents(id) ON DELETE CASCADE;

ALTER TABLE public.consent_templates ADD CONSTRAINT consent_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.consents ADD CONSTRAINT consents_cancellation_policy_version_id_fkey FOREIGN KEY (cancellation_policy_version_id) REFERENCES cancellation_policy_versions(id) ON DELETE SET NULL;

ALTER TABLE public.consents ADD CONSTRAINT consents_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.consents ADD CONSTRAINT consents_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.consents ADD CONSTRAINT consents_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id);

ALTER TABLE public.consents ADD CONSTRAINT consents_template_id_fkey FOREIGN KEY (template_id) REFERENCES consent_templates(id);

ALTER TABLE public.debts ADD CONSTRAINT debts_bono_id_fkey FOREIGN KEY (bono_id) REFERENCES bonos(id) ON DELETE SET NULL;

ALTER TABLE public.debts ADD CONSTRAINT debts_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.debts ADD CONSTRAINT debts_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.debts ADD CONSTRAINT debts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.debts ADD CONSTRAINT debts_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.emotional_records ADD CONSTRAINT emotional_records_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.emotional_records ADD CONSTRAINT emotional_records_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expense_recurring_templates ADD CONSTRAINT expense_recurring_templates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_compensation_agreement_id_fkey FOREIGN KEY (compensation_agreement_id) REFERENCES professional_compensation_agreements(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_recurring_template_id_fkey FOREIGN KEY (recurring_template_id) REFERENCES expense_recurring_templates(id) ON DELETE SET NULL;

ALTER TABLE public.expenses ADD CONSTRAINT expenses_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.google_calendar_channels ADD CONSTRAINT google_calendar_channels_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.google_session_sync_state ADD CONSTRAINT google_session_sync_state_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.google_session_sync_state ADD CONSTRAINT google_session_sync_state_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE public.google_sync_debounce ADD CONSTRAINT google_sync_debounce_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.google_sync_locks ADD CONSTRAINT google_sync_locks_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.integration_errors ADD CONSTRAINT integration_errors_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_original_invoice_id_fkey FOREIGN KEY (original_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_correction_operations ADD CONSTRAINT invoice_correction_operations_resulting_invoice_id_fkey FOREIGN KEY (resulting_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_billable_event_id_fkey FOREIGN KEY (billable_event_id) REFERENCES billable_events(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_bono_id_fkey FOREIGN KEY (bono_id) REFERENCES bonos(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_series ADD CONSTRAINT invoice_series_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_replacement_invoice_id_fkey FOREIGN KEY (replacement_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.invoice_substitutions ADD CONSTRAINT invoice_substitutions_substituted_invoice_id_fkey FOREIGN KEY (substituted_invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_correction_operation_id_fkey FOREIGN KEY (correction_operation_id) REFERENCES invoice_correction_operations(id) ON DELETE RESTRICT;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_rectified_invoice_id_fkey FOREIGN KEY (rectified_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.invoices ADD CONSTRAINT invoices_series_id_fkey FOREIGN KEY (series_id) REFERENCES invoice_series(id);

ALTER TABLE public.location_schedules ADD CONSTRAINT location_schedules_location_id_fkey FOREIGN KEY (location_id) REFERENCES center_locations(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;

ALTER TABLE public.oauth_connections ADD CONSTRAINT oauth_connections_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.patient_custom_price_history ADD CONSTRAINT patient_custom_price_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);

ALTER TABLE public.patient_custom_price_history ADD CONSTRAINT patient_custom_price_history_patient_custom_price_id_fkey FOREIGN KEY (patient_custom_price_id) REFERENCES patient_custom_prices(id) ON DELETE CASCADE;

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.patient_custom_prices ADD CONSTRAINT patient_custom_prices_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_magic_links ADD CONSTRAINT patient_magic_links_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_magic_links ADD CONSTRAINT patient_magic_links_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_mandate_policy_version_id_fkey FOREIGN KEY (mandate_policy_version_id) REFERENCES cancellation_policy_versions(id) ON DELETE SET NULL;

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_payment_methods ADD CONSTRAINT patient_payment_methods_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.patient_portal_accounts ADD CONSTRAINT patient_portal_accounts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_portal_accounts ADD CONSTRAINT patient_portal_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.patient_portal_otp_codes ADD CONSTRAINT patient_portal_otp_codes_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_portal_otp_codes ADD CONSTRAINT patient_portal_otp_codes_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_ai_generated_document_id_fkey FOREIGN KEY (ai_generated_document_id) REFERENCES ai_generated_documents(id) ON DELETE SET NULL;

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_report_links ADD CONSTRAINT patient_report_links_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT patient_tariff_plan_assignments_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT patient_tariff_plan_assignments_tariff_plan_id_fkey FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT patient_tariff_plan_assignments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.patient_tariff_plan_assignments ADD CONSTRAINT patient_tariff_plan_assignments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.patients ADD CONSTRAINT patients_assigned_professional_id_fkey FOREIGN KEY (assigned_professional_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.patients ADD CONSTRAINT patients_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.payments ADD CONSTRAINT payments_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.payments ADD CONSTRAINT payments_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.payments ADD CONSTRAINT payments_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.plaud_oauth_states ADD CONSTRAINT plaud_oauth_states_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.plaud_oauth_states ADD CONSTRAINT plaud_oauth_states_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

ALTER TABLE public.plaud_recordings ADD CONSTRAINT plaud_recordings_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.portal_intake_requests ADD CONSTRAINT portal_intake_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_category_id_fkey FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL;

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.professional_compensation_agreements ADD CONSTRAINT professional_compensation_agreements_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.professional_integrations ADD CONSTRAINT professional_integrations_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE SET NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.public_short_links ADD CONSTRAINT public_short_links_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_bono_id_fkey FOREIGN KEY (bono_id) REFERENCES bonos(id);

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_location_id_fkey FOREIGN KEY (location_id) REFERENCES center_locations(id);

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.recurring_series ADD CONSTRAINT recurring_series_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id);

ALTER TABLE public.referral_partner_requests ADD CONSTRAINT referral_partner_requests_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.referral_partner_requests ADD CONSTRAINT referral_partner_requests_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES profiles(id);

ALTER TABLE public.referral_partners ADD CONSTRAINT referral_partners_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.referral_specialties ADD CONSTRAINT referral_specialties_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.schedule_exceptions ADD CONSTRAINT schedule_exceptions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.schedule_exceptions ADD CONSTRAINT schedule_exceptions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.schedule_exceptions ADD CONSTRAINT schedule_exceptions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.session_types ADD CONSTRAINT session_types_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_bono_id_fkey FOREIGN KEY (bono_id) REFERENCES bonos(id) ON DELETE SET NULL;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_cancellation_policy_version_id_fkey FOREIGN KEY (cancellation_policy_version_id) REFERENCES cancellation_policy_versions(id) ON DELETE SET NULL;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_custom_price_id_fkey FOREIGN KEY (custom_price_id) REFERENCES patient_custom_prices(id);

ALTER TABLE public.sessions ADD CONSTRAINT sessions_location_id_fkey FOREIGN KEY (location_id) REFERENCES center_locations(id) ON DELETE SET NULL;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_recurring_series_id_fkey FOREIGN KEY (recurring_series_id) REFERENCES recurring_series(id) ON DELETE SET NULL;

ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_type_id_fkey FOREIGN KEY (session_type_id) REFERENCES session_types(id);

ALTER TABLE public.special_day_slots ADD CONSTRAINT special_day_slots_special_day_id_fkey FOREIGN KEY (special_day_id) REFERENCES special_days(id) ON DELETE CASCADE;

ALTER TABLE public.special_days ADD CONSTRAINT special_days_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.special_days ADD CONSTRAINT special_days_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.special_days ADD CONSTRAINT special_days_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.tariff_plan_items ADD CONSTRAINT tariff_plan_items_tariff_plan_id_fkey FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id) ON DELETE CASCADE;

ALTER TABLE public.tariff_plans ADD CONSTRAINT tariff_plans_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.tariff_plans ADD CONSTRAINT tariff_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.verifactu_chain_status ADD CONSTRAINT verifactu_chain_status_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.verifactu_chain_status ADD CONSTRAINT verifactu_chain_status_ultima_factura_id_fkey FOREIGN KEY (ultima_factura_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.verifactu_chain_status ADD CONSTRAINT verifactu_chain_status_ultima_verifactu_record_id_fkey FOREIGN KEY (ultima_verifactu_record_id) REFERENCES verifactu_records(id) ON DELETE SET NULL;

ALTER TABLE public.verifactu_events ADD CONSTRAINT verifactu_events_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.verifactu_events ADD CONSTRAINT verifactu_events_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.verifactu_records ADD CONSTRAINT verifactu_records_previous_record_id_fkey FOREIGN KEY (previous_record_id) REFERENCES verifactu_records(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_messages ADD CONSTRAINT whatsapp_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES whatsapp_messages(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_queue ADD CONSTRAINT whatsapp_queue_session_id_fkey FOREIGN KEY (session_id) REFERENCES whatsapp_sessions(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_center_id_fkey FOREIGN KEY (center_id) REFERENCES centers(id) ON DELETE CASCADE;

ALTER TABLE public.whatsapp_sessions ADD CONSTRAINT whatsapp_sessions_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE INDEX ai_document_defaults_document_type_idx ON public.ai_document_defaults USING btree (document_type_id);

CREATE UNIQUE INDEX ai_document_defaults_scope_uidx ON public.ai_document_defaults USING btree (center_id, COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), audience);

CREATE UNIQUE INDEX ai_document_types_scope_key_uidx ON public.ai_document_types USING btree (COALESCE(center_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

CREATE INDEX ai_generated_documents_patient_generated_at_idx ON public.ai_generated_documents USING btree (patient_id, generated_at DESC);

CREATE INDEX ai_generated_documents_session_type_idx ON public.ai_generated_documents USING btree (session_id, document_type_id);

CREATE INDEX ai_prompt_versions_precedence_idx ON public.ai_prompt_versions USING btree (document_type_id, center_id, is_published, version DESC);

CREATE INDEX app_change_log_status_idx ON public.app_change_log USING btree (status);

CREATE INDEX app_change_log_version_id_idx ON public.app_change_log USING btree (version_id);

CREATE INDEX app_versions_is_current_idx ON public.app_versions USING btree (is_current) WHERE (is_current = true);

CREATE INDEX app_versions_status_idx ON public.app_versions USING btree (status);

CREATE INDEX audit_logs_action_idx ON public.audit_logs USING btree (action);

CREATE INDEX audit_logs_created_at_idx ON public.audit_logs USING btree (created_at DESC);

CREATE INDEX audit_logs_is_anomalous_idx ON public.audit_logs USING btree (is_anomalous) WHERE (is_anomalous = true);

CREATE INDEX audit_logs_organization_id_idx ON public.audit_logs USING btree (organization_id);

CREATE INDEX audit_logs_patient_id_idx ON public.audit_logs USING btree (patient_id);

CREATE INDEX audit_logs_resource_type_idx ON public.audit_logs USING btree (resource_type);

CREATE INDEX audit_logs_user_id_idx ON public.audit_logs USING btree (user_id);

CREATE UNIQUE INDEX autoregistro_links_access_token_idx ON public.autoregistro_links USING btree (access_token);

CREATE UNIQUE INDEX bono_items_session_id_unique ON public.bono_items USING btree (session_id);

CREATE UNIQUE INDEX bonos_stripe_checkout_session_id_key ON public.bonos USING btree (stripe_checkout_session_id) WHERE (stripe_checkout_session_id IS NOT NULL);

CREATE UNIQUE INDEX cancellation_charges_one_active_per_session ON public.cancellation_charges USING btree (session_id) WHERE ((session_id IS NOT NULL) AND (status = 'pending_review'::text));

CREATE UNIQUE INDEX debts_access_token_idx ON public.debts USING btree (access_token);

CREATE UNIQUE INDEX google_session_sync_state_professional_event_idx ON public.google_session_sync_state USING btree (professional_id, google_event_id);

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);

CREATE INDEX idx_audit_log_table_record ON public.audit_log USING btree (table_name, record_id);

CREATE INDEX idx_availability_session_type_id ON public.availability USING btree (session_type_id);

CREATE INDEX idx_billable_events_patient ON public.billable_events USING btree (patient_id);

CREATE INDEX idx_billable_events_session ON public.billable_events USING btree (session_id);

CREATE INDEX idx_billable_events_status ON public.billable_events USING btree (billing_status);

CREATE INDEX idx_calendar_events_is_converted ON public.calendar_events USING btree (is_converted) WHERE (is_converted = false);

CREATE INDEX idx_calendar_events_professional_range ON public.calendar_events USING btree (professional_id, start_at, end_at) WHERE (deleted = false);

CREATE INDEX idx_calendar_events_professional_start ON public.calendar_events USING btree (professional_id, start_at);

CREATE INDEX idx_cancellation_charges_center_status ON public.cancellation_charges USING btree (center_id, status);

CREATE INDEX idx_cancellation_charges_patient ON public.cancellation_charges USING btree (patient_id, created_at DESC);

CREATE INDEX idx_cancellation_policy_versions_center_active ON public.cancellation_policy_versions USING btree (center_id, is_active);

CREATE UNIQUE INDEX idx_centers_portal_slug ON public.centers USING btree (portal_slug) WHERE (portal_slug IS NOT NULL);

CREATE UNIQUE INDEX idx_centers_single_software_provider ON public.centers USING btree (is_software_provider) WHERE (is_software_provider = true);

CREATE INDEX idx_compensation_agreements_center ON public.professional_compensation_agreements USING btree (center_id);

CREATE UNIQUE INDEX idx_compensation_agreements_one_active ON public.professional_compensation_agreements USING btree (professional_id) WHERE ((is_active = true) AND (effective_to IS NULL));

CREATE INDEX idx_compensation_agreements_professional ON public.professional_compensation_agreements USING btree (professional_id, is_active, effective_from);

CREATE INDEX idx_email_send_log_created ON public.email_send_log USING btree (created_at DESC);

CREATE INDEX idx_email_send_log_message ON public.email_send_log USING btree (message_id);

CREATE UNIQUE INDEX idx_email_send_log_message_sent_unique ON public.email_send_log USING btree (message_id) WHERE (status = 'sent'::text);

CREATE INDEX idx_email_send_log_recipient ON public.email_send_log USING btree (recipient_email);

CREATE INDEX idx_emotional_records_date ON public.emotional_records USING btree (record_date);

CREATE INDEX idx_emotional_records_patient ON public.emotional_records USING btree (patient_id);

CREATE INDEX idx_expense_categories_center ON public.expense_categories USING btree (center_id, display_order, name);

CREATE INDEX idx_expense_recurring_templates_center ON public.expense_recurring_templates USING btree (center_id, is_active);

CREATE INDEX idx_expenses_category ON public.expenses USING btree (category_id);

CREATE INDEX idx_expenses_center_date ON public.expenses USING btree (center_id, expense_date DESC);

CREATE INDEX idx_expenses_center_status_due ON public.expenses USING btree (center_id, status, due_date);

CREATE INDEX idx_expenses_created_by ON public.expenses USING btree (created_by);

CREATE INDEX idx_expenses_professional ON public.expenses USING btree (professional_id);

CREATE INDEX idx_expenses_recurring_template ON public.expenses USING btree (recurring_template_id);

CREATE INDEX idx_expenses_supplier ON public.expenses USING btree (supplier_id);

CREATE UNIQUE INDEX idx_expenses_unique_compensation_period ON public.expenses USING btree (compensation_agreement_id, compensation_period_start) WHERE (compensation_agreement_id IS NOT NULL);

CREATE UNIQUE INDEX idx_expenses_unique_recurring_period ON public.expenses USING btree (recurring_template_id, generated_period_start) WHERE (recurring_template_id IS NOT NULL);

CREATE INDEX idx_google_calendar_channels_channel_id ON public.google_calendar_channels USING btree (channel_id);

CREATE INDEX idx_google_sync_debounce_pending ON public.google_sync_debounce USING btree (pending) WHERE (pending = true);

CREATE INDEX idx_integration_errors_at ON public.integration_errors USING btree (at DESC);

CREATE INDEX idx_integration_errors_correlation_id ON public.integration_errors USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);

CREATE INDEX idx_integration_errors_professional_id ON public.integration_errors USING btree (professional_id);

CREATE INDEX idx_integration_errors_provider ON public.integration_errors USING btree (provider);

CREATE INDEX idx_invoice_correction_operations_center ON public.invoice_correction_operations USING btree (center_id, created_at DESC);

CREATE INDEX idx_invoice_correction_operations_result ON public.invoice_correction_operations USING btree (resulting_invoice_id);

CREATE INDEX idx_invoice_items_billable_event ON public.invoice_items USING btree (billable_event_id);

CREATE UNIQUE INDEX idx_invoice_series_default_per_document_type ON public.invoice_series USING btree (center_id, series_type, invoice_type) WHERE ((is_default = true) AND (is_archived = false));

CREATE INDEX idx_invoice_substitutions_replacement ON public.invoice_substitutions USING btree (replacement_invoice_id);

CREATE INDEX idx_invoices_access_token ON public.invoices USING btree (access_token);

CREATE INDEX idx_invoices_center_issue_date ON public.invoices USING btree (center_id, issue_date DESC, created_at DESC);

CREATE UNIQUE INDEX idx_invoices_correction_operation_unique ON public.invoices USING btree (correction_operation_id) WHERE (correction_operation_id IS NOT NULL);

CREATE INDEX idx_invoices_rectified_invoice_id ON public.invoices USING btree (rectified_invoice_id);

CREATE INDEX idx_magic_links_email_center ON public.patient_magic_links USING btree (email, center_id);

CREATE INDEX idx_magic_links_token ON public.patient_magic_links USING btree (token);

CREATE INDEX idx_notifications_meta_message_id ON public.notifications USING btree (meta_message_id) WHERE (meta_message_id IS NOT NULL);

CREATE INDEX idx_patient_payment_methods_center_patient_status ON public.patient_payment_methods USING btree (center_id, patient_id, status);

CREATE INDEX idx_payments_session_id ON public.payments USING btree (session_id);

CREATE INDEX idx_payments_status ON public.payments USING btree (status);

CREATE INDEX idx_payments_stripe_charge_id ON public.payments USING btree (stripe_charge_id) WHERE (stripe_charge_id IS NOT NULL);

CREATE INDEX idx_pcp_active ON public.patient_custom_prices USING btree (patient_id, target_type, target_id, is_active);

CREATE INDEX idx_pcp_center_id ON public.patient_custom_prices USING btree (center_id);

CREATE INDEX idx_pcp_patient_id ON public.patient_custom_prices USING btree (patient_id);

CREATE INDEX idx_pcp_target ON public.patient_custom_prices USING btree (target_type, target_id);

CREATE INDEX idx_pcph_custom_price_id ON public.patient_custom_price_history USING btree (patient_custom_price_id);

CREATE INDEX idx_pcph_patient_id ON public.patient_custom_price_history USING btree (patient_id);

CREATE INDEX idx_plaud_recordings_center_start_at ON public.plaud_recordings USING btree (center_id, start_at);

CREATE INDEX idx_plaud_recordings_center_status ON public.plaud_recordings USING btree (center_id, status);

CREATE INDEX idx_plaud_recordings_patient ON public.plaud_recordings USING btree (patient_id) WHERE (patient_id IS NOT NULL);

CREATE INDEX idx_plaud_recordings_pending_transcript ON public.plaud_recordings USING btree (center_id, created_at) WHERE (transcript_text IS NULL);

CREATE INDEX idx_plaud_recordings_session ON public.plaud_recordings USING btree (session_id) WHERE (session_id IS NOT NULL);

CREATE INDEX idx_plaud_recordings_transcript_expiry ON public.plaud_recordings USING btree (transcript_expires_at) WHERE (transcript_text IS NOT NULL);

CREATE INDEX idx_portal_intake_requests_center_id ON public.portal_intake_requests USING btree (center_id);

CREATE INDEX idx_portal_intake_requests_center_type_status ON public.portal_intake_requests USING btree (center_id, request_type, status, created_at DESC);

CREATE INDEX idx_portal_intake_requests_status ON public.portal_intake_requests USING btree (status);

CREATE INDEX idx_ptpa_active ON public.patient_tariff_plan_assignments USING btree (patient_id, is_active);

CREATE INDEX idx_ptpa_center ON public.patient_tariff_plan_assignments USING btree (center_id);

CREATE INDEX idx_ptpa_patient ON public.patient_tariff_plan_assignments USING btree (patient_id);

CREATE INDEX idx_recurring_series_active ON public.recurring_series USING btree (is_active) WHERE (is_active = true);

CREATE INDEX idx_recurring_series_center ON public.recurring_series USING btree (center_id);

CREATE INDEX idx_recurring_series_patient ON public.recurring_series USING btree (patient_id);

CREATE INDEX idx_recurring_series_professional ON public.recurring_series USING btree (professional_id);

CREATE INDEX idx_referral_partners_center_active_priority ON public.referral_partners USING btree (center_id, active, priority);

CREATE INDEX idx_referral_specialties_center_active_priority ON public.referral_specialties USING btree (center_id, active, priority);

CREATE INDEX idx_session_types_is_public ON public.session_types USING btree (center_id, is_public) WHERE ((is_public = true) AND (is_active = true));

CREATE INDEX idx_session_types_order ON public.session_types USING btree (center_id, display_order, name);

CREATE INDEX idx_sessions_access_token ON public.sessions USING btree (access_token);

CREATE INDEX idx_sessions_advance_payment_due ON public.sessions USING btree (center_id, advance_payment_due_at) WHERE ((status = 'scheduled'::session_status) AND (payment_status = ANY (ARRAY['pending'::text, 'reminder_sent'::text, 'overdue'::text])) AND (advance_payment_due_at IS NOT NULL));

CREATE INDEX idx_sessions_cancelled_for_non_payment_patient ON public.sessions USING btree (patient_id) WHERE (cancelled_for_non_payment = true);

CREATE INDEX idx_sessions_recurring_series ON public.sessions USING btree (recurring_series_id) WHERE (recurring_series_id IS NOT NULL);

CREATE UNIQUE INDEX idx_sessions_series_occurrence ON public.sessions USING btree (recurring_series_id, occurrence_index) WHERE (recurring_series_id IS NOT NULL);

CREATE INDEX idx_sessions_session_type_id ON public.sessions USING btree (session_type_id);

CREATE INDEX idx_special_day_slots_parent ON public.special_day_slots USING btree (special_day_id);

CREATE INDEX idx_special_days_center_range ON public.special_days USING btree (center_id, start_date, end_date) WHERE (scope = 'center'::special_day_scope);

CREATE INDEX idx_special_days_professional_range ON public.special_days USING btree (center_id, professional_id, start_date, end_date) WHERE (scope = 'professional'::special_day_scope);

CREATE INDEX idx_suppliers_center ON public.suppliers USING btree (center_id, name);

CREATE UNIQUE INDEX idx_suppliers_center_taxid ON public.suppliers USING btree (center_id, tax_id) WHERE (tax_id IS NOT NULL);

CREATE INDEX idx_suppressed_emails_email ON public.suppressed_emails USING btree (email);

CREATE INDEX idx_tariff_plans_center ON public.tariff_plans USING btree (center_id);

CREATE INDEX idx_tariff_plans_default ON public.tariff_plans USING btree (center_id, is_default) WHERE (is_default = true);

CREATE INDEX idx_tpi_target ON public.tariff_plan_items USING btree (target_type, target_id);

CREATE INDEX idx_tpi_tariff_plan ON public.tariff_plan_items USING btree (tariff_plan_id);

CREATE INDEX idx_unsubscribe_tokens_token ON public.email_unsubscribe_tokens USING btree (token);

CREATE INDEX idx_user_roles_center_id ON public.user_roles USING btree (center_id);

CREATE INDEX idx_verifactu_chain_lookup ON public.verifactu_chain_status USING btree (center_id, nif_emisor, id_sistema_informatico, numero_instalacion);

CREATE INDEX idx_verifactu_events_center_id ON public.verifactu_events USING btree (center_id);

CREATE INDEX idx_verifactu_events_created_at ON public.verifactu_events USING btree (created_at);

CREATE INDEX idx_verifactu_events_event_type ON public.verifactu_events USING btree (event_type);

CREATE INDEX idx_verifactu_events_invoice_id ON public.verifactu_events USING btree (invoice_id);

CREATE INDEX idx_verifactu_records_center_chain ON public.verifactu_records USING btree (center_id, taxpayer_nif, system_id, installation_id, created_at);

CREATE UNIQUE INDEX idx_verifactu_records_hash_unique ON public.verifactu_records USING btree (center_id, taxpayer_nif, system_id, installation_id, hash);

CREATE INDEX idx_verifactu_records_invoice ON public.verifactu_records USING btree (invoice_id);

CREATE INDEX idx_verifactu_records_previous ON public.verifactu_records USING btree (previous_record_id);

CREATE INDEX idx_whatsapp_messages_center ON public.whatsapp_messages USING btree (center_id);

CREATE INDEX idx_whatsapp_messages_created ON public.whatsapp_messages USING btree (created_at DESC);

CREATE INDEX idx_whatsapp_messages_message_type ON public.whatsapp_messages USING btree (message_type);

CREATE INDEX idx_whatsapp_messages_meta_message_id ON public.whatsapp_messages USING btree (meta_message_id) WHERE (meta_message_id IS NOT NULL);

CREATE INDEX idx_whatsapp_messages_patient_id ON public.whatsapp_messages USING btree (patient_id);

CREATE INDEX idx_whatsapp_messages_phone ON public.whatsapp_messages USING btree (phone);

CREATE INDEX idx_whatsapp_messages_session_id ON public.whatsapp_messages USING btree (session_id);

CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages USING btree (status);

CREATE INDEX idx_whatsapp_queue_center ON public.whatsapp_queue USING btree (center_id);

CREATE INDEX idx_whatsapp_queue_status_scheduled ON public.whatsapp_queue USING btree (status, scheduled_at) WHERE (status = 'pending'::text);

CREATE INDEX idx_whatsapp_sessions_center ON public.whatsapp_sessions USING btree (center_id);

CREATE INDEX idx_whatsapp_sessions_status ON public.whatsapp_sessions USING btree (status);

CREATE INDEX patient_portal_otp_expiry_idx ON public.patient_portal_otp_codes USING btree (expires_at) WHERE (used_at IS NULL);

CREATE INDEX patient_portal_otp_patient_created_idx ON public.patient_portal_otp_codes USING btree (patient_id, created_at DESC);

CREATE INDEX patient_report_links_patient_idx ON public.patient_report_links USING btree (patient_id, created_at DESC);

CREATE INDEX patient_report_links_token_idx ON public.patient_report_links USING btree (access_token);

CREATE INDEX public_short_links_active_lookup_idx ON public.public_short_links USING btree (code) WHERE (revoked_at IS NULL);

CREATE INDEX rate_limit_log_lookup_idx ON public.rate_limit_log USING btree (ip, action, created_at);

CREATE UNIQUE INDEX sessions_google_calendar_event_id_unique ON public.sessions USING btree (google_calendar_event_id) WHERE (google_calendar_event_id IS NOT NULL);

CREATE INDEX sessions_scheduled_payment_send_idx ON public.sessions USING btree (advance_payment_send_at) WHERE ((payment_mode = 'scheduled_before'::text) AND (advance_payment_notification_sent_at IS NULL) AND (status = 'scheduled'::session_status));

CREATE UNIQUE INDEX uniq_bono_items_bono_session ON public.bono_items USING btree (bono_id, session_id);

CREATE UNIQUE INDEX uq_patient_payment_methods_active ON public.patient_payment_methods USING btree (patient_id, connected_account_id) WHERE (status = 'active'::text);

CREATE TRIGGER app_change_log_updated_at BEFORE UPDATE ON public.app_change_log FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER app_versions_updated_at BEFORE UPDATE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER audit_assessments_changes AFTER INSERT OR DELETE OR UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_autoregistro_entries_changes AFTER INSERT OR DELETE OR UPDATE ON public.autoregistro_entries FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_bonos_trigger AFTER INSERT OR DELETE OR UPDATE ON public.bonos FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_centers_trigger AFTER INSERT OR DELETE OR UPDATE ON public.centers FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_consents_changes AFTER INSERT OR DELETE OR UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_debts_trigger AFTER INSERT OR DELETE OR UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_invoice_items_changes AFTER INSERT OR DELETE OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION audit_invoice_item_change();

CREATE TRIGGER audit_invoices_changes AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_invoices_trigger AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_patients_changes AFTER INSERT OR DELETE OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_patients_trigger AFTER INSERT OR DELETE OR UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_payments_trigger AFTER INSERT OR DELETE OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_sessions_changes AFTER INSERT OR DELETE OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION audit_clinical_change();

CREATE TRIGGER audit_sessions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER enforce_single_current_version_trigger BEFORE INSERT OR UPDATE ON public.app_versions FOR EACH ROW EXECUTE FUNCTION enforce_single_current_version();

CREATE TRIGGER enforce_single_online_location BEFORE INSERT OR UPDATE ON public.center_locations FOR EACH ROW EXECUTE FUNCTION check_single_online_location();

CREATE TRIGGER prevent_published_prompt_version_modification_trigger BEFORE UPDATE ON public.ai_prompt_versions FOR EACH ROW EXECUTE FUNCTION prevent_published_prompt_version_modification();

CREATE TRIGGER protect_used_invoice_series_classification_trigger BEFORE UPDATE OF invoice_type, series_type, is_archived ON public.invoice_series FOR EACH ROW EXECUTE FUNCTION protect_used_invoice_series_classification();

CREATE TRIGGER seed_ai_document_defaults_after_center_insert AFTER INSERT ON public.centers FOR EACH ROW EXECUTE FUNCTION trg_seed_ai_document_defaults_for_new_center();

CREATE TRIGGER seed_ai_prompt_versions_after_center_insert AFTER INSERT ON public.centers FOR EACH ROW EXECUTE FUNCTION trg_seed_ai_prompt_versions_for_new_center();

CREATE TRIGGER session_generate_token BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION generate_session_access_token();

CREATE TRIGGER trg_apply_resolved_price BEFORE INSERT ON public.sessions FOR EACH ROW EXECUTE FUNCTION apply_resolved_price_to_session();

CREATE TRIGGER trg_check_custom_price_overlap BEFORE INSERT OR UPDATE ON public.patient_custom_prices FOR EACH ROW EXECUTE FUNCTION check_custom_price_overlap();

CREATE TRIGGER trg_check_tariff_assignment_overlap BEFORE INSERT OR UPDATE ON public.patient_tariff_plan_assignments FOR EACH ROW EXECUTE FUNCTION check_tariff_assignment_overlap();

CREATE TRIGGER trg_enforce_single_default_per_day BEFORE INSERT OR UPDATE ON public.location_schedules FOR EACH ROW EXECUTE FUNCTION enforce_single_default_per_day();

CREATE TRIGGER trg_pcp_updated_at BEFORE UPDATE ON public.patient_custom_prices FOR EACH ROW EXECUTE FUNCTION update_patient_custom_prices_updated_at();

CREATE TRIGGER trg_prevent_profile_center_self_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION prevent_profile_center_self_change();

CREATE TRIGGER trg_protect_consent_anon_update BEFORE UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION protect_consent_anon_update();

CREATE TRIGGER trg_protect_invoice_immutability BEFORE DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION protect_invoice_immutability();

CREATE TRIGGER trg_protect_invoice_items_immutability BEFORE INSERT OR DELETE OR UPDATE ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION protect_invoice_items_immutability();

CREATE TRIGGER trg_protect_professional_payment_category BEFORE DELETE OR UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION protect_professional_payment_category();

CREATE TRIGGER trg_protect_session_anon_update BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION protect_session_anon_update();

CREATE TRIGGER trg_ptpa_updated_at BEFORE UPDATE ON public.patient_tariff_plan_assignments FOR EACH ROW EXECUTE FUNCTION update_ptpa_updated_at();

CREATE TRIGGER trg_record_custom_price_history AFTER INSERT OR UPDATE ON public.patient_custom_prices FOR EACH ROW EXECUTE FUNCTION record_custom_price_history();

CREATE TRIGGER trg_reset_reminder_on_reschedule BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION reset_reminder_on_reschedule();

CREATE TRIGGER trg_seed_default_expense_categories AFTER INSERT ON public.centers FOR EACH ROW EXECUTE FUNCTION seed_default_expense_categories();

CREATE TRIGGER trg_single_default_tariff_plan AFTER INSERT OR UPDATE ON public.tariff_plans FOR EACH ROW EXECUTE FUNCTION enforce_single_default_tariff_plan();

CREATE TRIGGER trg_special_day_slots_updated_at BEFORE UPDATE ON public.special_day_slots FOR EACH ROW EXECUTE FUNCTION special_days_set_updated_at();

CREATE TRIGGER trg_special_days_updated_at BEFORE UPDATE ON public.special_days FOR EACH ROW EXECUTE FUNCTION special_days_set_updated_at();

CREATE TRIGGER trg_tariff_plans_updated_at BEFORE UPDATE ON public.tariff_plans FOR EACH ROW EXECUTE FUNCTION update_tariff_plans_updated_at();

CREATE TRIGGER trg_tpi_updated_at BEFORE UPDATE ON public.tariff_plan_items FOR EACH ROW EXECUTE FUNCTION update_tariff_plan_items_updated_at();

CREATE TRIGGER trg_validate_no_session_overlap BEFORE INSERT OR UPDATE OF session_date, start_time, end_time, status, professional_id ON public.sessions FOR EACH ROW EXECUTE FUNCTION validate_no_session_overlap();

CREATE TRIGGER trigger_session_patient_status AFTER INSERT OR DELETE OR UPDATE OF status, session_date, patient_id ON public.sessions FOR EACH ROW EXECUTE FUNCTION trigger_update_patient_status_on_session_change();

CREATE TRIGGER update_ai_document_defaults_updated_at BEFORE UPDATE ON public.ai_document_defaults FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_document_types_updated_at BEFORE UPDATE ON public.ai_document_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessment_templates_updated_at BEFORE UPDATE ON public.assessment_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at BEFORE UPDATE ON public.assessments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_autoregistro_alert_rules_updated_at BEFORE UPDATE ON public.autoregistro_alert_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_availability_updated_at BEFORE UPDATE ON public.availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billable_events_updated_at BEFORE UPDATE ON public.billable_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bono_templates_updated_at BEFORE UPDATE ON public.bono_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bonos_updated_at BEFORE UPDATE ON public.bonos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION update_calendar_events_updated_at();

CREATE TRIGGER update_cancellation_charges_updated_at BEFORE UPDATE ON public.cancellation_charges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cancellation_policy_versions_updated_at BEFORE UPDATE ON public.cancellation_policy_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_center_drive_connections_updated_at BEFORE UPDATE ON public.center_drive_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_center_locations_updated_at BEFORE UPDATE ON public.center_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_center_plaud_connections_updated_at BEFORE UPDATE ON public.center_plaud_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_centers_updated_at BEFORE UPDATE ON public.centers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_communication_templates_updated_at BEFORE UPDATE ON public.communication_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_compensation_agreements_updated_at BEFORE UPDATE ON public.professional_compensation_agreements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consent_templates_updated_at BEFORE UPDATE ON public.consent_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consents_updated_at BEFORE UPDATE ON public.consents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_debts_updated_at BEFORE UPDATE ON public.debts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_recurring_templates_updated_at BEFORE UPDATE ON public.expense_recurring_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoice_series_updated_at BEFORE UPDATE ON public.invoice_series FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_location_schedules_updated_at BEFORE UPDATE ON public.location_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_oauth_connections_updated_at BEFORE UPDATE ON public.oauth_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_portal_accounts_updated_at BEFORE UPDATE ON public.patient_portal_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patients_updated_at BEFORE UPDATE ON public.patients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_plaud_recordings_updated_at BEFORE UPDATE ON public.plaud_recordings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portal_intake_requests_updated_at BEFORE UPDATE ON public.portal_intake_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_professional_integrations_updated_at BEFORE UPDATE ON public.professional_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_series_updated_at BEFORE UPDATE ON public.recurring_series FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_partner_requests_updated_at BEFORE UPDATE ON public.referral_partner_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_partners_updated_at BEFORE UPDATE ON public.referral_partners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_specialties_updated_at BEFORE UPDATE ON public.referral_specialties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_session_types_updated_at BEFORE UPDATE ON public.session_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verifactu_chain_status_updated_at BEFORE UPDATE ON public.verifactu_chain_status FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_verifactu_records_updated_at BEFORE UPDATE ON public.verifactu_records FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_messages_updated_at BEFORE UPDATE ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_whatsapp_sessions_updated_at BEFORE UPDATE ON public.whatsapp_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER validate_invoice_series_document_type_trigger BEFORE INSERT OR UPDATE OF series_id, invoice_type, status ON public.invoices FOR EACH ROW EXECUTE FUNCTION validate_invoice_series_document_type();

ALTER TABLE public.ai_document_defaults ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_document_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_generated_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_prompt_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_change_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoregistro_alert_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoregistro_alert_rules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoregistro_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoregistro_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.autoregistro_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.billable_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bono_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bono_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bonos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cancellation_charges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.cancellation_policy_versions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.center_drive_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.center_locations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.center_plaud_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.centers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communication_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consent_signatures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consent_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_send_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_send_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.email_unsubscribe_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.emotional_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expense_recurring_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_calendar_channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_session_sync_state ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_sync_debounce ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_sync_locks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_correction_operations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_substitutions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.location_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.oauth_connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_custom_price_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_custom_prices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_magic_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_payment_methods ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_portal_accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_portal_otp_codes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_report_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patient_tariff_plan_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaud_oauth_states ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.plaud_recordings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.portal_intake_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.professional_compensation_agreements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.professional_integrations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.public_short_links ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recurring_series ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_partner_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_partners ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.referral_specialties ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.special_day_slots ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.special_days ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppressed_emails ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tariff_plan_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tariff_plans ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verifactu_chain_status ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verifactu_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.verifactu_records ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_queue ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage center document defaults" ON public.ai_document_defaults AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (professional_id IS NULL) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (professional_id IS NULL) AND is_admin(auth.uid())));

CREATE POLICY "Professionals manage own document defaults" ON public.ai_document_defaults AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (professional_id = auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (professional_id = auth.uid())));

CREATE POLICY "View document defaults in center" ON public.ai_document_defaults AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins manage center document types" ON public.ai_document_types AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (professional_id IS NULL) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (professional_id IS NULL) AND is_admin(auth.uid())));

CREATE POLICY "Professionals manage own document types" ON public.ai_document_types AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (professional_id = auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (professional_id = auth.uid())));

CREATE POLICY "View document types (system, center or own)" ON public.ai_document_types AS PERMISSIVE FOR SELECT TO public
  USING (((center_id IS NULL) OR ((center_id = get_user_center_id(auth.uid())) AND ((professional_id IS NULL) OR (professional_id = auth.uid())))));

CREATE POLICY "Admins delete generated documents in center" ON public.ai_generated_documents AS PERMISSIVE FOR DELETE TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Insert generated documents in center" ON public.ai_generated_documents AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Update generated documents in center" ON public.ai_generated_documents AS PERMISSIVE FOR UPDATE TO public
  USING ((center_id = get_user_center_id(auth.uid())))
  WITH CHECK ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "View generated documents in center" ON public.ai_generated_documents AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins delete unpublished prompt versions" ON public.ai_prompt_versions AS PERMISSIVE FOR DELETE TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid()) AND (is_published = false)));

CREATE POLICY "Create prompt versions in center" ON public.ai_prompt_versions AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR (professional_id = auth.uid()))));

CREATE POLICY "Update own unpublished prompt versions" ON public.ai_prompt_versions AS PERMISSIVE FOR UPDATE TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR (professional_id = auth.uid())) AND (is_published = false)))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR (professional_id = auth.uid()))));

CREATE POLICY "View prompt versions in center" ON public.ai_prompt_versions AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins can manage app_change_log" ON public.app_change_log AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can manage app_versions" ON public.app_versions AS PERMISSIVE FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Professionals can delete assessment responses from their center" ON public.assessment_responses AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM (assessments a
     JOIN profiles p ON ((p.center_id = a.center_id)))
  WHERE ((a.id = assessment_responses.assessment_id) AND (p.id = auth.uid())))));

CREATE POLICY "Service role can insert responses" ON public.assessment_responses AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view responses from their center" ON public.assessment_responses AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM assessments a
  WHERE ((a.id = assessment_responses.assessment_id) AND (a.center_id = get_user_center_id(auth.uid()))))));

CREATE POLICY "Admins can manage templates" ON public.assessment_templates AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Professionals can create templates" ON public.assessment_templates AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid())));

CREATE POLICY "Public can view template via token" ON public.assessment_templates AS PERMISSIVE FOR SELECT TO public
  USING (verify_assessment_token_for_template(id));

CREATE POLICY "Users can view templates from their center" ON public.assessment_templates AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Professionals can create assessments" ON public.assessments AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid())));

CREATE POLICY "Professionals can delete assessments from their center" ON public.assessments AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.center_id = assessments.center_id) AND (p.id = auth.uid())))));

CREATE POLICY "Professionals can update assessments" ON public.assessments AS PERMISSIVE FOR UPDATE TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid())));

CREATE POLICY "Public can view assessment via token" ON public.assessments AS PERMISSIVE FOR SELECT TO public
  USING (((access_token = get_assessment_token()) AND (status = 'pending'::assessment_status) AND (expires_at > now())));

CREATE POLICY "Users can view assessments from their center" ON public.assessments AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins can view audit log" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin(auth.uid()) AND (user_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid()))))));

CREATE POLICY "Service role can insert audit log" ON public.audit_log AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "No direct delete" ON public.audit_logs AS PERMISSIVE FOR DELETE TO public
  USING (false);

CREATE POLICY "No direct insert" ON public.audit_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (false);

CREATE POLICY "No direct read" ON public.audit_logs AS PERMISSIVE FOR SELECT TO public
  USING (false);

CREATE POLICY "No direct update" ON public.audit_logs AS PERMISSIVE FOR UPDATE TO public
  USING (false);

CREATE POLICY "Service role can insert alert logs" ON public.autoregistro_alert_logs AS PERMISSIVE FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can view alert logs of their center" ON public.autoregistro_alert_logs AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can create alert rules for their center" ON public.autoregistro_alert_rules AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((center_id = ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can delete alert rules of their center" ON public.autoregistro_alert_rules AS PERMISSIVE FOR DELETE TO authenticated
  USING ((center_id = ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can update alert rules of their center" ON public.autoregistro_alert_rules AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((center_id = ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can view alert rules of their center" ON public.autoregistro_alert_rules AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Anon can insert entries via token" ON public.autoregistro_entries AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK ((EXISTS ( SELECT 1
   FROM autoregistro_links
  WHERE ((autoregistro_links.id = autoregistro_entries.link_id) AND (autoregistro_links.access_token = get_autoregistro_token()) AND (autoregistro_links.status = 'active'::text) AND ((autoregistro_links.expires_at IS NULL) OR (autoregistro_links.expires_at > now()))))));

CREATE POLICY "Anon can read entries for feedback" ON public.autoregistro_entries AS PERMISSIVE FOR SELECT TO anon
  USING ((EXISTS ( SELECT 1
   FROM (autoregistro_links al
     JOIN autoregistro_templates at2 ON ((at2.id = al.template_id)))
  WHERE ((al.access_token = get_autoregistro_token()) AND (al.status = 'active'::text) AND (al.patient_id = autoregistro_entries.patient_id) AND (al.template_id = autoregistro_entries.template_id) AND (at2.patient_feedback_enabled = true)))));

CREATE POLICY "Users can delete own center entries" ON public.autoregistro_entries AS PERMISSIVE FOR DELETE TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Users can read own center entries" ON public.autoregistro_entries AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon can read link by token" ON public.autoregistro_links AS PERMISSIVE FOR SELECT TO anon
  USING (((access_token = get_autoregistro_token()) AND (status = 'active'::text) AND ((expires_at IS NULL) OR (expires_at > now()))));

CREATE POLICY "Users can manage own center links" ON public.autoregistro_links AS PERMISSIVE FOR ALL TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())))
  WITH CHECK ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon can read template by token" ON public.autoregistro_templates AS PERMISSIVE FOR SELECT TO anon
  USING ((EXISTS ( SELECT 1
   FROM autoregistro_links
  WHERE ((autoregistro_links.template_id = autoregistro_templates.id) AND (autoregistro_links.access_token = get_autoregistro_token()) AND (autoregistro_links.status = 'active'::text)))));

CREATE POLICY "Users can manage own center templates" ON public.autoregistro_templates AS PERMISSIVE FOR ALL TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())))
  WITH CHECK ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Professionals can manage their availability" ON public.availability AS PERMISSIVE FOR ALL TO authenticated
  USING (((professional_id = auth.uid()) OR is_admin(auth.uid())));

CREATE POLICY "Public read availability for portal" ON public.availability AS PERMISSIVE FOR SELECT TO public
  USING ((professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE ((profiles.is_active = true) AND (profiles.center_id IN ( SELECT centers.id
           FROM centers
          WHERE (centers.portal_enabled = true)))))));

CREATE POLICY "View availability in center" ON public.availability AS PERMISSIVE FOR SELECT TO authenticated
  USING ((professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Manage billable events in center" ON public.billable_events AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View billable events in center" ON public.billable_events AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage bono items" ON public.bono_items AS PERMISSIVE FOR ALL TO authenticated
  USING (((bono_id IN ( SELECT bonos.id
   FROM bonos
  WHERE (bonos.center_id = get_user_center_id(auth.uid())))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View bono items" ON public.bono_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bono_id IN ( SELECT bonos.id
   FROM bonos
  WHERE (bonos.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Manage bono templates" ON public.bono_templates AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View bono templates in center" ON public.bono_templates AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage bonos in center" ON public.bonos AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View bonos in center" ON public.bonos AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Professionals can manage their calendar events" ON public.calendar_events AS PERMISSIVE FOR ALL TO authenticated
  USING (((professional_id = auth.uid()) OR (is_admin(auth.uid()) AND (professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))))))
  WITH CHECK (((professional_id = auth.uid()) OR (is_admin(auth.uid()) AND (professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))))));

CREATE POLICY "Professionals can view their calendar events" ON public.calendar_events AS PERMISSIVE FOR SELECT TO authenticated
  USING (((professional_id = auth.uid()) OR (is_admin(auth.uid()) AND (professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))))));

CREATE POLICY "Users can manage cancellation charges from their center" ON public.cancellation_charges AS PERMISSIVE FOR ALL TO public
  USING ((center_id = get_user_center_id(auth.uid())))
  WITH CHECK ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Users can view cancellation charges from their center" ON public.cancellation_charges AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins can manage cancellation policies from their center" ON public.cancellation_policy_versions AS PERMISSIVE FOR ALL TO public
  USING ((has_role(auth.uid(), 'admin'::app_role) AND (center_id = get_user_center_id(auth.uid()))))
  WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) AND (center_id = get_user_center_id(auth.uid()))));

CREATE POLICY "Users can view cancellation policies from their center" ON public.cancellation_policy_versions AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon read location by valid session token" ON public.center_locations AS PERMISSIVE FOR SELECT TO anon
  USING (verify_session_token_for_location(id));

CREATE POLICY "Manage locations in center" ON public.center_locations AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Public read location via validated session token" ON public.center_locations AS PERMISSIVE FOR SELECT TO public
  USING (verify_session_token_for_location(id));

CREATE POLICY "Public read public locations for portal" ON public.center_locations AS PERMISSIVE FOR SELECT TO public
  USING (((is_public = true) AND (center_id IN ( SELECT centers.id
   FROM centers
  WHERE (centers.portal_enabled = true)))));

CREATE POLICY "Public session can view its location" ON public.center_locations AS PERMISSIVE FOR SELECT TO public
  USING (verify_session_token_for_location(id));

CREATE POLICY "View locations in center" ON public.center_locations AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins can delete centers" ON public.centers AS PERMISSIVE FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update centers" ON public.centers AS PERMISSIVE FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can view their center" ON public.centers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin(auth.uid()) AND (id = get_user_center_id(auth.uid()))));

CREATE POLICY "Users can create their first center" ON public.centers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (user_can_create_center(auth.uid()));

CREATE POLICY "Manage communication templates in center" ON public.communication_templates AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View communication templates in center" ON public.communication_templates AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon insert signature by valid consent token" ON public.consent_signatures AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK ((EXISTS ( SELECT 1
   FROM consents c
  WHERE ((c.id = consent_signatures.consent_id) AND (c.access_token IS NOT NULL) AND (c.access_token = get_consent_token()) AND (c.status = 'pending'::consent_status)))));

CREATE POLICY "Anon read signatures by valid consent token" ON public.consent_signatures AS PERMISSIVE FOR SELECT TO anon
  USING ((EXISTS ( SELECT 1
   FROM consents c
  WHERE ((c.id = consent_signatures.consent_id) AND (c.access_token IS NOT NULL) AND (c.access_token = get_consent_token())))));

CREATE POLICY "View signatures in center" ON public.consent_signatures AS PERMISSIVE FOR SELECT TO authenticated
  USING ((consent_id IN ( SELECT consents.id
   FROM consents
  WHERE (consents.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Anon read template by valid consent token" ON public.consent_templates AS PERMISSIVE FOR SELECT TO anon
  USING (verify_consent_token_for_template(id));

CREATE POLICY "Manage templates in center" ON public.consent_templates AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View templates in center" ON public.consent_templates AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon read consent by valid token" ON public.consents AS PERMISSIVE FOR SELECT TO anon
  USING (((access_token IS NOT NULL) AND (access_token = get_consent_token())));

CREATE POLICY "Anon update consent by valid token" ON public.consents AS PERMISSIVE FOR UPDATE TO anon
  USING (((access_token IS NOT NULL) AND (access_token = get_consent_token())))
  WITH CHECK (((access_token IS NOT NULL) AND (access_token = get_consent_token())));

CREATE POLICY "Manage consents in center" ON public.consents AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View consents in center" ON public.consents AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Manage debts" ON public.debts AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View debts in center" ON public.debts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Clinical staff can manage emotional records for their center" ON public.emotional_records AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'professional'::app_role))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'professional'::app_role))));

CREATE POLICY "Admins manage expense categories" ON public.expense_categories AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "View expense categories in center" ON public.expense_categories AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins manage recurring expense templates" ON public.expense_recurring_templates AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "View recurring expense templates in center" ON public.expense_recurring_templates AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Admins manage all expenses in center" ON public.expenses AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Professionals delete their own pending expenses" ON public.expenses AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (created_by = auth.uid()) AND (status = 'pending'::expense_status) AND (kind <> 'professional_payment'::expense_kind)));

CREATE POLICY "Professionals insert their own expenses" ON public.expenses AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (created_by = auth.uid()) AND (kind <> 'professional_payment'::expense_kind)));

CREATE POLICY "Professionals update their own pending expenses" ON public.expenses AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (created_by = auth.uid()) AND (status = 'pending'::expense_status) AND (kind <> 'professional_payment'::expense_kind)))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (created_by = auth.uid()) AND (kind <> 'professional_payment'::expense_kind)));

CREATE POLICY "Professionals view their own expenses" ON public.expenses AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND ((created_by = auth.uid()) OR (professional_id = auth.uid()))));

CREATE POLICY "Professional delete own channels" ON public.google_calendar_channels AS PERMISSIVE FOR DELETE TO authenticated
  USING ((professional_id = auth.uid()));

CREATE POLICY "Professional insert own channels" ON public.google_calendar_channels AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((professional_id = auth.uid()));

CREATE POLICY "Professional read own channels" ON public.google_calendar_channels AS PERMISSIVE FOR SELECT TO authenticated
  USING ((professional_id = auth.uid()));

CREATE POLICY "Service role manages channels" ON public.google_calendar_channels AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on google_sync_debounce" ON public.google_sync_debounce AS PERMISSIVE FOR ALL TO service_role
  USING ((auth.role() = 'service_role'::text))
  WITH CHECK ((auth.role() = 'service_role'::text));

CREATE POLICY "Users can insert their own integration errors" ON public.integration_errors AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((professional_id = auth.uid()));

CREATE POLICY "Users can view their own integration errors" ON public.integration_errors AS PERMISSIVE FOR SELECT TO public
  USING ((professional_id = auth.uid()));

CREATE POLICY "Admins can view invoice correction operations" ON public.invoice_correction_operations AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin(auth.uid()) AND (center_id = get_user_center_id(auth.uid()))));

CREATE POLICY "Anon read invoice items by valid token" ON public.invoice_items AS PERMISSIVE FOR SELECT TO anon
  USING ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.access_token IS NOT NULL) AND (i.access_token = get_invoice_token())))));

CREATE POLICY "Manage invoice items" ON public.invoice_items AS PERMISSIVE FOR ALL TO authenticated
  USING (((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.center_id = get_user_center_id(auth.uid())))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Public read invoice items by valid token" ON public.invoice_items AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_items.invoice_id) AND (i.access_token IS NOT NULL) AND (i.access_token = get_invoice_token())))));

CREATE POLICY "View invoice items" ON public.invoice_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Manage invoice series in center" ON public.invoice_series AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View invoice series in center" ON public.invoice_series AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Center staff can view invoice substitutions" ON public.invoice_substitutions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Anon read invoice by valid token" ON public.invoices AS PERMISSIVE FOR SELECT TO anon
  USING (((access_token IS NOT NULL) AND (access_token = get_invoice_token())));

CREATE POLICY "Manage invoices in center" ON public.invoices AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View invoices in center" ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage schedules in center" ON public.location_schedules AS PERMISSIVE FOR ALL TO public
  USING (((location_id IN ( SELECT center_locations.id
   FROM center_locations
  WHERE (center_locations.center_id = get_user_center_id(auth.uid())))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Public read location schedules for portal" ON public.location_schedules AS PERMISSIVE FOR SELECT TO public
  USING ((location_id IN ( SELECT center_locations.id
   FROM center_locations
  WHERE (center_locations.center_id IN ( SELECT centers.id
           FROM centers
          WHERE (centers.portal_enabled = true))))));

CREATE POLICY "View schedules in center" ON public.location_schedules AS PERMISSIVE FOR SELECT TO public
  USING ((location_id IN ( SELECT center_locations.id
   FROM center_locations
  WHERE (center_locations.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Manage notifications" ON public.notifications AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View notifications in center" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Professionals can delete own oauth connections" ON public.oauth_connections AS PERMISSIVE FOR DELETE TO authenticated
  USING ((professional_id = auth.uid()));

CREATE POLICY "Professionals can insert oauth connections" ON public.oauth_connections AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((professional_id = auth.uid()));

CREATE POLICY "Professionals can select own oauth connections" ON public.oauth_connections AS PERMISSIVE FOR SELECT TO authenticated
  USING ((professional_id = auth.uid()));

CREATE POLICY "Professionals can update own oauth connections" ON public.oauth_connections AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((professional_id = auth.uid()))
  WITH CHECK ((professional_id = auth.uid()));

CREATE POLICY pcph_center_insert ON public.patient_custom_price_history AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY pcph_center_read ON public.patient_custom_price_history AS PERMISSIVE FOR SELECT TO public
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY pcp_center_access ON public.patient_custom_prices AS PERMISSIVE FOR ALL TO public
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))))
  WITH CHECK ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Professionals can view their center magic links" ON public.patient_magic_links AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Service role can manage magic links" ON public.patient_magic_links AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Center staff can view patient payment methods" ON public.patient_payment_methods AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins and professionals can manage portal accounts in center" ON public.patient_portal_accounts AS PERMISSIVE FOR ALL TO authenticated
  USING (((is_admin(auth.uid()) OR is_professional(auth.uid())) AND (patient_id IN ( SELECT patients.id
   FROM patients
  WHERE (patients.center_id = get_user_center_id(auth.uid()))))))
  WITH CHECK (((is_admin(auth.uid()) OR is_professional(auth.uid())) AND (patient_id IN ( SELECT patients.id
   FROM patients
  WHERE (patients.center_id = get_user_center_id(auth.uid()))))));

CREATE POLICY "Patients can view their own portal account" ON public.patient_portal_accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = auth.uid()));

CREATE POLICY "Create report links in center" ON public.patient_report_links AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View report links in center" ON public.patient_report_links AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY ptpa_center_read ON public.patient_tariff_plan_assignments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY ptpa_center_write_delete ON public.patient_tariff_plan_assignments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY ptpa_center_write_insert ON public.patient_tariff_plan_assignments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY ptpa_center_write_update ON public.patient_tariff_plan_assignments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Professionals can manage patients" ON public.patients AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Professionals can view patients in their center" ON public.patients AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Manage payments" ON public.payments AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View payments in center" ON public.payments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins and professionals delete plaud recordings in center" ON public.plaud_recordings AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals update plaud recordings in center" ON public.plaud_recordings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View plaud recordings in center" ON public.plaud_recordings AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals can update intake requests" ON public.portal_intake_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Allow anon insert for public submissions" ON public.portal_intake_requests AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK (((center_id IS NOT NULL) AND (request_type IS NOT NULL) AND (length(TRIM(BOTH FROM first_name)) > 0) AND (length(TRIM(BOTH FROM last_name)) > 0) AND (length(TRIM(BOTH FROM email)) > 0) AND (status = 'pending'::text)));

CREATE POLICY "Users can insert intake requests for their center" ON public.portal_intake_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can update intake requests from their center" ON public.portal_intake_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can view intake requests from their center" ON public.portal_intake_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY "Users can view intake requests of their center" ON public.portal_intake_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins manage compensation agreements" ON public.professional_compensation_agreements AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Professionals view their own compensation agreement" ON public.professional_compensation_agreements AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (professional_id = auth.uid())));

CREATE POLICY "Professionals manage own integrations" ON public.professional_integrations AS PERMISSIVE FOR ALL TO public
  USING (((professional_id = auth.uid()) OR (is_admin(auth.uid()) AND (professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))))))
  WITH CHECK (((professional_id = auth.uid()) OR (is_admin(auth.uid()) AND (professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))))));

CREATE POLICY "View integrations in center" ON public.professional_integrations AS PERMISSIVE FOR SELECT TO authenticated
  USING (((professional_id IN ( SELECT profiles.id
   FROM profiles
  WHERE (profiles.center_id = get_user_center_id(auth.uid())))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins can manage profiles in their center" ON public.profiles AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (get_user_center_id(auth.uid()) IS NOT NULL) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (get_user_center_id(auth.uid()) IS NOT NULL) AND is_admin(auth.uid())));

CREATE POLICY "Users can insert their own profile" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((id = auth.uid()));

CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid()));

CREATE POLICY "Users can view profiles in their center" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) OR (id = auth.uid())));

CREATE POLICY "No direct access" ON public.rate_limit_log AS PERMISSIVE FOR ALL TO public
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Professionals can manage recurring series in their center" ON public.recurring_series AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can view recurring series in their center" ON public.recurring_series AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon can submit referral with required fields" ON public.referral_partner_requests AS PERMISSIVE FOR INSERT TO anon
  WITH CHECK (((center_id IS NOT NULL) AND (length(TRIM(BOTH FROM name)) > 0) AND (length(TRIM(BOTH FROM email)) > 0) AND (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text) AND (privacy_accepted = true) AND (status = 'pending'::text)));

CREATE POLICY "Center members can update requests" ON public.referral_partner_requests AS PERMISSIVE FOR UPDATE TO public
  USING ((center_id IN ( SELECT p.center_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));

CREATE POLICY "Center members can view requests" ON public.referral_partner_requests AS PERMISSIVE FOR SELECT TO public
  USING ((center_id IN ( SELECT p.center_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));

CREATE POLICY "Admins and professionals can insert referral partners" ON public.referral_partners AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals can update referral partners" ON public.referral_partners AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins can delete referral partners" ON public.referral_partners AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Users can view referral partners of their center" ON public.referral_partners AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins and professionals can insert referral specialties" ON public.referral_specialties AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals can update referral specialties" ON public.referral_specialties AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins can delete referral specialties" ON public.referral_specialties AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Users can view referral specialties of their center" ON public.referral_specialties AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage schedule exceptions in center" ON public.schedule_exceptions AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Public read schedule exceptions for booking" ON public.schedule_exceptions AS PERMISSIVE FOR SELECT TO anon
  USING (((affects_booking = true) AND (center_id IN ( SELECT centers.id
   FROM centers
  WHERE ((centers.public_booking_enabled = true) OR (centers.portal_enabled = true))))));

CREATE POLICY "View schedule exceptions in center" ON public.schedule_exceptions AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage session types in center" ON public.session_types AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Public read session types for portal" ON public.session_types AS PERMISSIVE FOR SELECT TO public
  USING (((is_active = true) AND (center_id IN ( SELECT centers.id
   FROM centers
  WHERE (centers.portal_enabled = true)))));

CREATE POLICY "View session types in center" ON public.session_types AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Anon read session by valid token" ON public.sessions AS PERMISSIVE FOR SELECT TO anon
  USING (((access_token IS NOT NULL) AND (access_token = get_session_token())));

CREATE POLICY "Anon update session by valid token" ON public.sessions AS PERMISSIVE FOR UPDATE TO anon
  USING (((access_token IS NOT NULL) AND (access_token = get_session_token())))
  WITH CHECK (((access_token IS NOT NULL) AND (access_token = get_session_token())));

CREATE POLICY "Professionals can manage sessions" ON public.sessions AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View sessions in center" ON public.sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Admins manage special day slots" ON public.special_day_slots AS PERMISSIVE FOR ALL TO public
  USING ((special_day_id IN ( SELECT special_days.id
   FROM special_days
  WHERE ((special_days.center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))))
  WITH CHECK ((special_day_id IN ( SELECT special_days.id
   FROM special_days
  WHERE ((special_days.center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))));

CREATE POLICY "Professionals manage own special day slots" ON public.special_day_slots AS PERMISSIVE FOR ALL TO public
  USING ((special_day_id IN ( SELECT special_days.id
   FROM special_days
  WHERE ((special_days.center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (special_days.scope = 'professional'::special_day_scope) AND (special_days.professional_id = auth.uid())))))
  WITH CHECK ((special_day_id IN ( SELECT special_days.id
   FROM special_days
  WHERE ((special_days.center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (special_days.scope = 'professional'::special_day_scope) AND (special_days.professional_id = auth.uid())))));

CREATE POLICY "View special day slots in center" ON public.special_day_slots AS PERMISSIVE FOR SELECT TO public
  USING ((special_day_id IN ( SELECT special_days.id
   FROM special_days
  WHERE (special_days.center_id = get_user_center_id(auth.uid())))));

CREATE POLICY "Admins manage special days" ON public.special_days AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Professionals manage own special days" ON public.special_days AS PERMISSIVE FOR ALL TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (scope = 'professional'::special_day_scope) AND (professional_id = auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND is_professional(auth.uid()) AND (scope = 'professional'::special_day_scope) AND (professional_id = auth.uid())));

CREATE POLICY "Public read special days for booking" ON public.special_days AS PERMISSIVE FOR SELECT TO anon
  USING (((affects_public_booking = true) AND (center_id IN ( SELECT centers.id
   FROM centers
  WHERE ((centers.public_booking_enabled = true) OR (centers.portal_enabled = true))))));

CREATE POLICY "View special days in center" ON public.special_days AS PERMISSIVE FOR SELECT TO public
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY "Manage suppliers in center" ON public.suppliers AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "View suppliers in center" ON public.suppliers AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id = get_user_center_id(auth.uid())));

CREATE POLICY tpi_center_read ON public.tariff_plan_items AS PERMISSIVE FOR SELECT TO authenticated
  USING ((tariff_plan_id IN ( SELECT tp.id
   FROM (tariff_plans tp
     JOIN profiles p ON ((p.center_id = tp.center_id)))
  WHERE (p.id = auth.uid()))));

CREATE POLICY tpi_center_write_delete ON public.tariff_plan_items AS PERMISSIVE FOR DELETE TO authenticated
  USING (((tariff_plan_id IN ( SELECT tp.id
   FROM (tariff_plans tp
     JOIN profiles p ON ((p.center_id = tp.center_id)))
  WHERE (p.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY tpi_center_write_insert ON public.tariff_plan_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((tariff_plan_id IN ( SELECT tp.id
   FROM (tariff_plans tp
     JOIN profiles p ON ((p.center_id = tp.center_id)))
  WHERE (p.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY tpi_center_write_update ON public.tariff_plan_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((tariff_plan_id IN ( SELECT tp.id
   FROM (tariff_plans tp
     JOIN profiles p ON ((p.center_id = tp.center_id)))
  WHERE (p.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((tariff_plan_id IN ( SELECT tp.id
   FROM (tariff_plans tp
     JOIN profiles p ON ((p.center_id = tp.center_id)))
  WHERE (p.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY tp_center_read ON public.tariff_plans AS PERMISSIVE FOR SELECT TO authenticated
  USING ((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

CREATE POLICY tp_center_write_delete ON public.tariff_plans AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY tp_center_write_insert ON public.tariff_plans AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY tp_center_write_update ON public.tariff_plans AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins can manage roles in their center" ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (get_user_center_id(auth.uid()) IS NOT NULL) AND is_admin(auth.uid())))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (get_user_center_id(auth.uid()) IS NOT NULL) AND is_admin(auth.uid())));

CREATE POLICY "Users can view roles in their center" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = auth.uid()) OR ((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid()))));

CREATE POLICY "Centers can manage their chain status" ON public.verifactu_chain_status AS PERMISSIVE FOR ALL TO authenticated
  USING ((is_admin(auth.uid()) AND (center_id IN ( SELECT p.center_id
   FROM profiles p
  WHERE (p.id = auth.uid())))))
  WITH CHECK ((is_admin(auth.uid()) AND (center_id IN ( SELECT p.center_id
   FROM profiles p
  WHERE (p.id = auth.uid())))));

CREATE POLICY "Admin read verifactu events" ON public.verifactu_events AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM (invoices i
     JOIN profiles p ON ((p.center_id = i.center_id)))
  WHERE ((i.id = verifactu_events.invoice_id) AND (p.id = auth.uid()) AND is_admin(auth.uid())))));

CREATE POLICY "Service role can manage verifactu events" ON public.verifactu_events AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "View verifactu events in center" ON public.verifactu_events AS PERMISSIVE FOR SELECT TO public
  USING (((center_id = get_user_center_id(auth.uid())) AND is_admin(auth.uid())));

CREATE POLICY "Admins can view their center verifactu records" ON public.verifactu_records AS PERMISSIVE FOR SELECT TO authenticated
  USING ((is_admin(auth.uid()) AND (center_id = get_user_center_id(auth.uid()))));

CREATE POLICY "Service role full access messages" ON public.whatsapp_messages AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can create messages for their center" ON public.whatsapp_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can update their center's messages" ON public.whatsapp_messages AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can view their center's messages" ON public.whatsapp_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Service role full access queue" ON public.whatsapp_queue AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can manage their center's queue" ON public.whatsapp_queue AS PERMISSIVE FOR ALL TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can view their center's queue" ON public.whatsapp_queue AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals can view their center's whatsapp sessi" ON public.whatsapp_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id IN ( SELECT profiles.center_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'professional'::app_role))));

CREATE POLICY "Service role full access sessions" ON public.whatsapp_sessions AS PERMISSIVE FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can create sessions for their center" ON public.whatsapp_sessions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can delete their center's sessions" ON public.whatsapp_sessions AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Users can update their center's sessions" ON public.whatsapp_sessions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_defaults TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_defaults TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_defaults TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_types TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_types TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_document_types TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_generated_documents TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_generated_documents TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_generated_documents TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_prompt_versions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_prompt_versions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_prompt_versions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_change_log TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_change_log TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_change_log TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_versions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_versions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.app_versions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_responses TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_responses TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_responses TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessment_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assessments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_logs TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_logs TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_logs TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_logs TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_rules TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_rules TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_alert_rules TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_entries TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_entries TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_entries TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_links TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_links TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_links TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.autoregistro_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.availability TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.availability TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.availability TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billable_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billable_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billable_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_items TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_items TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_items TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bono_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bonos TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bonos TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.bonos TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.calendar_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.calendar_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.calendar_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_charges TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_charges TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_charges TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_policy_versions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_policy_versions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.cancellation_policy_versions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.center_drive_connections TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.center_locations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.center_locations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.center_locations TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.center_plaud_connections TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers_public TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers_public TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers_public TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.centers TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.communication_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.communication_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.communication_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_signatures TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_signatures TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_signatures TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consent_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.consents TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consents TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.consents TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.debts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.debts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.debts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_log TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_send_state TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.email_unsubscribe_tokens TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.emotional_records TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.emotional_records TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.emotional_records TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_categories TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_categories TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_categories TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_recurring_templates TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_recurring_templates TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expense_recurring_templates TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.expenses TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_calendar_channels TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_calendar_channels TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_calendar_channels TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_session_sync_state TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_sync_debounce TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_sync_debounce TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_sync_debounce TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.google_sync_locks TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_errors TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_errors TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.integration_errors TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_correction_operations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_correction_operations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_correction_operations TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_items TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_items TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_items TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_series TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_series TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_series TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_substitutions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_substitutions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_substitutions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoices TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoices TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoices TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_schedules TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_schedules TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.location_schedules TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections_safe TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections_safe TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections_safe TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.oauth_connections TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_price_history TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_price_history TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_price_history TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_prices TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_prices TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_custom_prices TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_magic_links TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_magic_links TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_magic_links TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_payment_methods TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_payment_methods TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_payment_methods TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_portal_accounts TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_portal_accounts TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_portal_accounts TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_portal_otp_codes TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_report_links TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_report_links TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_report_links TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_tariff_plan_assignments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_tariff_plan_assignments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patient_tariff_plan_assignments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients_public TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients_public TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients_public TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.patients TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plaud_oauth_states TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plaud_recordings TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plaud_recordings TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.plaud_recordings TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_centers TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_centers TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_centers TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_intake_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_intake_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.portal_intake_requests TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_compensation_agreements TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_compensation_agreements TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_compensation_agreements TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_integrations TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_integrations TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.professional_integrations TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_public TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_public TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles_public TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_short_links TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_log TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_log TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rate_limit_log TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recurring_series TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recurring_series TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recurring_series TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partner_requests TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partner_requests TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partner_requests TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partners TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partners TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_partners TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_specialties TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_specialties TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_specialties TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.schedule_exceptions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.schedule_exceptions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.schedule_exceptions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.session_types TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.session_types TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.session_types TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sessions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sessions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sessions TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_day_slots TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_day_slots TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_day_slots TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_days TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_days TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.special_days TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_webhook_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_webhook_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.stripe_webhook_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppliers TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppliers TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppliers TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.suppressed_emails TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plan_items TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plan_items TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plan_items TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plans TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plans TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tariff_plans TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_roles TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_chain_status TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_chain_status TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_chain_status TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_events TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_events TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_events TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_records TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_records TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.verifactu_records TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_messages TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_messages TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_messages TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_queue TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_queue TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_queue TO service_role;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_sessions TO anon;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_sessions TO authenticated;

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.whatsapp_sessions TO service_role;

-- -----------------------------------------------------------------------------
-- Revocaciones deliberadas
--
-- Supabase concede permisos por defecto a `anon` y `authenticated` sobre las
-- tablas nuevas. En producción se revocaron sobre estas 7 tablas, que guardan
-- tokens OAuth, cerrojos de sincronización y códigos OTP del portal. Sin estas
-- líneas, un entorno nuevo quedaría más abierto que producción: RLS seguiría
-- protegiendo, pero se perdería la segunda barrera.
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.center_drive_connections  FROM anon, authenticated;
REVOKE ALL ON TABLE public.center_plaud_connections  FROM anon, authenticated;
REVOKE ALL ON TABLE public.google_session_sync_state FROM anon, authenticated;
REVOKE ALL ON TABLE public.google_sync_locks         FROM anon, authenticated;
REVOKE ALL ON TABLE public.patient_portal_otp_codes  FROM anon, authenticated;
REVOKE ALL ON TABLE public.plaud_oauth_states        FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_short_links        FROM anon, authenticated;

-- =============================================================================
-- 3. STORAGE, AUTH Y CRON (fuera del esquema public)
-- =============================================================================
-- ---------------------------------------------------------------------------
-- 2. Buckets de storage
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) VALUES
  ('consent-documents', 'consent-documents', false),
  ('expense-receipts',  'expense-receipts',  false),
  ('invoice-documents', 'invoice-documents', false),
  ('invoice-logos',     'invoice-logos',     true)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Políticas RLS sobre storage.objects (16 en producción)
--    Viven en el esquema `storage`, fuera de cualquier volcado de `public`.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can view invoice logos" ON storage.objects;
CREATE POLICY "Anyone can view invoice logos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'invoice-logos');

DROP POLICY IF EXISTS "Authenticated users can upload invoice logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload invoice logos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-logos'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their center logos" ON storage.objects;
CREATE POLICY "Users can update their center logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their center logos" ON storage.objects;
CREATE POLICY "Users can delete their center logos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Read consent docs from own center" ON storage.objects;
CREATE POLICY "Read consent docs from own center" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Insert consent docs into own center" ON storage.objects;
CREATE POLICY "Insert consent docs into own center" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update consent docs in own center" ON storage.objects;
CREATE POLICY "Update consent docs in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Delete consent docs in own center" ON storage.objects;
CREATE POLICY "Delete consent docs in own center" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Read expense receipts from own center" ON storage.objects;
CREATE POLICY "Read expense receipts from own center" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Insert expense receipts into own center" ON storage.objects;
CREATE POLICY "Insert expense receipts into own center" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update expense receipts in own center" ON storage.objects;
CREATE POLICY "Update expense receipts in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Delete expense receipts in own center" ON storage.objects;
CREATE POLICY "Delete expense receipts in own center" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Read invoice docs from own center" ON storage.objects;
CREATE POLICY "Read invoice docs from own center" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Insert invoice docs into own center" ON storage.objects;
CREATE POLICY "Insert invoice docs into own center" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update invoice docs in own center" ON storage.objects;
CREATE POLICY "Update invoice docs in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Delete invoice docs in own center" ON storage.objects;
CREATE POLICY "Delete invoice docs in own center" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Trigger sobre auth.users
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Trabajos de pg_cron (18 activos en producción el 2026-09-09)
--    Viven en el esquema `cron`, fuera de cualquier volcado de `public`.
--
--    AVISO: en producción, 7 de estos trabajos llevan el CRON_SECRET escrito
--    en claro dentro de cron.job.command. Aquí NO se reproduce ese literal:
--    todos leen el secreto de `vault`. Antes de levantar un entorno nuevo hay
--    que crear los secretos de vault que se listan abajo.
--
--    Secretos de vault necesarios:
--      cron_secret                          (genérico, para los 7 migrados)
--      payment_automation_cron_secret
--      drive_token_refresh_cron_secret
--      plaud_token_refresh_cron_secret
--      plaud_sync_cron_secret
--      plaud_transcript_cleanup_cron_secret
--      email_queue_service_role_key
-- ---------------------------------------------------------------------------
DO $cron$
DECLARE
  base_url text := current_setting('app.settings.functions_url', true);
  anon_key text := current_setting('app.settings.anon_key', true);

  FUNCTION_HEADERS jsonb;

  jobs CONSTANT jsonb := '[
    {"name":"send-payment-reminders-hourly",      "sched":"0 * * * *",    "fn":"send-payment-reminders",           "secret":"cron_secret"},
    {"name":"sync-google-calendar-all",           "sched":"*/15 * * * *", "fn":"sync-google-calendar",             "secret":null,  "body":"{\"sync_all_professionals\": true}"},
    {"name":"send-session-reminders-hourly",      "sched":"0 * * * *",    "fn":"send-session-reminders",           "secret":"cron_secret"},
    {"name":"renew-google-calendar-watches",      "sched":"0 */12 * * *", "fn":"renew-google-calendar-watches",     "secret":"cron_secret"},
    {"name":"renew-zoom-tokens-cron",             "sched":"0 */12 * * *", "fn":"renew-zoom-tokens",                "secret":"cron_secret"},
    {"name":"recompute-patient-statuses-daily",   "sched":"0 3 * * *",    "fn":"recompute-patient-statuses",       "secret":"cron_secret"},
    {"name":"retry-pending-verifactu",            "sched":"*/15 * * * *", "fn":"retry-pending-verifactu",          "secret":"cron_secret",                        "body":"{\"source\": \"cron\"}"},
    {"name":"process-advance-payment-deadlines",  "sched":"*/15 * * * *", "fn":"process-advance-payment-deadlines","secret":"cron_secret",                        "body":"{\"source\": \"cron\"}"},
    {"name":"process-payment-automation",         "sched":"*/10 * * * *", "fn":"process-advance-payment-deadlines","secret":"payment_automation_cron_secret"},
    {"name":"refresh-google-drive-tokens",        "sched":"*/15 * * * *", "fn":"refresh-google-drive-tokens",      "secret":"drive_token_refresh_cron_secret"},
    {"name":"generate-recurring-expenses",        "sched":"0 3 * * *",    "fn":"generate-recurring-expenses",      "secret":"payment_automation_cron_secret"},
    {"name":"generate-professional-payments",     "sched":"0 4 1 * *",    "fn":"generate-professional-payments",   "secret":"payment_automation_cron_secret"},
    {"name":"refresh-plaud-tokens",               "sched":"*/15 * * * *", "fn":"refresh-plaud-tokens",             "secret":"plaud_token_refresh_cron_secret"},
    {"name":"sync-plaud-recordings",              "sched":"*/15 * * * *", "fn":"sync-plaud-recordings",            "secret":"plaud_sync_cron_secret"},
    {"name":"cleanup-plaud-transcripts",          "sched":"30 3 * * *",   "fn":"cleanup-plaud-transcripts",        "secret":"plaud_transcript_cleanup_cron_secret"}
  ]'::jsonb;

  j jsonb;
BEGIN
  IF base_url IS NULL OR base_url = '' THEN
    RAISE NOTICE 'app.settings.functions_url sin definir: se omite el alta de crons HTTP.';
  ELSE
    FOR j IN SELECT * FROM jsonb_array_elements(jobs) LOOP
      PERFORM cron.unschedule(j->>'name') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j->>'name');
      PERFORM cron.schedule(
        j->>'name',
        j->>'sched',
        format(
          $sql$SELECT net.http_post(
                 url := %L,
                 headers := jsonb_build_object(
                   'Content-Type','application/json',
                   'Authorization','Bearer '||%L,
                   'x-cron-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L LIMIT 1),'')
                 ),
                 body := %L::jsonb
               );$sql$,
          base_url || '/' || (j->>'fn'),
          COALESCE(anon_key,''),
          COALESCE(j->>'secret',''),
          COALESCE(j->>'body','{}')
        )
      );
    END LOOP;
  END IF;

  -- Trabajos que sólo llaman a funciones SQL locales: no dependen de secretos.
  PERFORM cron.unschedule('auto-complete-past-sessions') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-complete-past-sessions');
  PERFORM cron.schedule('auto-complete-past-sessions', '0 23 * * *', 'SELECT public.auto_complete_past_sessions();');

  PERFORM cron.unschedule('generate-pending-debts-db') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='generate-pending-debts-db');
  PERFORM cron.schedule('generate-pending-debts-db', '0 6 * * *', 'SELECT public.generate_pending_debts_db();');

  PERFORM cron.unschedule('weekly-db-maintenance') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='weekly-db-maintenance');
  PERFORM cron.schedule('weekly-db-maintenance', '0 4 * * 0', 'SELECT public.weekly_db_maintenance();');
END
$cron$;

SET check_function_bodies = on;
