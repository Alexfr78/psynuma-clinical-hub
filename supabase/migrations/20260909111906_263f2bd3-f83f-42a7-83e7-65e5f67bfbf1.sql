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