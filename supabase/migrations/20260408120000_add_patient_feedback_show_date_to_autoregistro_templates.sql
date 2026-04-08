ALTER TABLE public.autoregistro_templates
ADD COLUMN IF NOT EXISTS patient_feedback_show_date boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.autoregistro_templates.patient_feedback_show_date IS 'If patient feedback is enabled, controls whether the patient sees the submitted_at date column in feedback panel.';

