-- =====================================================================
-- Enlaces de consulta de informes al paciente (no viajan por WhatsApp/email)
-- =====================================================================
-- Hasta ahora el resumen de sesión para el paciente viajaba completo dentro
-- del cuerpo del mensaje de WhatsApp/email (ver `notifications.message`).
-- Eso expone datos de salud más de lo necesario: con la Cloud API de Meta el
-- cifrado de extremo a extremo llega solo hasta el endpoint de Meta, donde el
-- mensaje se descifra y se conserva hasta 30 días; por email no hay ninguna
-- garantía de cifrado.
--
-- A partir de ahora el informe se queda en Psycma (Supabase, Zúrich) y al
-- paciente solo se le manda un aviso neutro con un enlace tokenizado
-- (`/informe/:token`, ver `src/pages/PatientReportView.tsx`) que apunta a una
-- fila de esta tabla.
--
-- Decisiones no obvias:
--
--  * `content_markdown` es una FOTO del informe en el momento del envío, no
--    una referencia viva a `ai_generated_documents`. Mismo criterio que
--    `consents.content_snapshot`: lo que el paciente puede leer por el
--    enlace debe ser exactamente lo que se le envió, aunque el documento se
--    reprocese o edite después. `ai_generated_document_id` se guarda solo
--    como referencia de auditoría (nullable: el envío desde
--    `SessionDetailDrawer` puede partir del espejo legado
--    `sessions.ai_summary_patient` cuando no hay fila en
--    `ai_generated_documents`).
--
--  * Caducidad de 30 días desde el envío, no de un solo uso: un enlace de un
--    solo uso impediría al paciente releer su propio resumen, y un enlace
--    eterno mantendría la exposición indefinidamente. 30 días es, además, el
--    mismo horizonte que motiva este cambio (lo que Meta conserva un mensaje
--    descifrado), así que no se alarga la ventana de exposición respecto a
--    lo que había antes.
--
--  * No hay política RLS pública "por token" (a diferencia de invoices/
--    consents/sessions, que sí exponen un `get_*_token()` + policy `USING`
--    para anon). La única vía de lectura pública es la edge function
--    `view-patient-report`, que usa el service role: así el contenido nunca
--    queda expuesto a través de PostgREST directamente, solo a través del
--    único punto que además registra el acceso (ver más abajo).
--
--  * El acceso del paciente (cuándo y desde qué IP) se registra reutilizando
--    `record_audit_event` / `logAuditEvent` (resourceType 'reports', acción
--    'VIEW') — el mismo mecanismo que ya usa `send-notification` para las
--    entregas de estos informes, en lugar de crear una tabla de log nueva
--    sin ninguna pantalla para consultarla. Eso da trazabilidad real: los
--    accesos aparecen ya filtrables por paciente / IP en /auditoria-clinica.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.patient_report_links (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id                 uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  patient_id                uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  session_id                uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  ai_generated_document_id  uuid REFERENCES public.ai_generated_documents(id) ON DELETE SET NULL,
  title                     text NOT NULL DEFAULT 'Resumen de tu sesión',
  content_markdown          text NOT NULL,
  access_token              text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  expires_at                timestamptz NOT NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_report_links_patient_idx
  ON public.patient_report_links (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_report_links_token_idx
  ON public.patient_report_links (access_token);

GRANT SELECT, INSERT ON public.patient_report_links TO authenticated;
GRANT ALL ON public.patient_report_links TO service_role;

ALTER TABLE public.patient_report_links ENABLE ROW LEVEL SECURITY;

-- Staff del centro: pueden ver los enlaces que se han generado (para poder
-- explicar a un paciente qué se le envió). Ninguna policy pública/anon: la
-- lectura pública pasa siempre por la edge function `view-patient-report`
-- (service role), que es también quien registra el acceso.
CREATE POLICY "View report links in center"
  ON public.patient_report_links
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Create report links in center"
  ON public.patient_report_links
  FOR INSERT
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

COMMENT ON TABLE public.patient_report_links IS
  'Enlaces tokenizados de un informe ya enviado a un paciente (/informe/:token). content_markdown es una foto inmutable del informe en el momento del envío, no una referencia viva. Caduca a los 30 días.';
