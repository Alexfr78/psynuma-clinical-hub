ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS ai_patient_document_keys text[] NULL;

COMMENT ON COLUMN public.patients.ai_patient_document_keys IS
  'NULL = usar la plantilla predeterminada del centro/profesional para el paciente (ai_document_defaults audience ''patient''); array vacío = no generar ningún documento para el paciente; array con keys = generar esas plantillas (ai_document_types.key, audience ''patient'', scope ''session'').';
