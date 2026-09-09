ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ai_summary_clinical text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS ai_summary_patient text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS transcript_processed_at timestamptz;