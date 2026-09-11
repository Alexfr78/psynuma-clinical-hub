-- Fase 3: estado de revisión para documentos generados por IA.
-- Los documentos existentes se consideran ya revisados; los nuevos nacen como borradores.

ALTER TABLE public.ai_generated_documents
  ADD COLUMN status text;

UPDATE public.ai_generated_documents
SET status = 'final'
WHERE status IS NULL;

ALTER TABLE public.ai_generated_documents
  ALTER COLUMN status SET DEFAULT 'draft'::text,
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.ai_generated_documents
  ADD CONSTRAINT ai_generated_documents_status_check
  CHECK (status IN ('draft', 'final'));

ALTER TABLE public.ai_generated_documents
  ADD COLUMN validated_by uuid,
  ADD COLUMN validated_at timestamp with time zone;