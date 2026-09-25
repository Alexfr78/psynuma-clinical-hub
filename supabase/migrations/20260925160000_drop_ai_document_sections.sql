-- ---------------------------------------------------------------------------
-- Fuera las columnas de apartados de los documentos IA.
--
-- Desde 20260925120000 el documento es markdown libre guiado por el prompt: ni la edge
-- function `analyze-session-transcription` ni el frontend leen ni escriben ya estas
-- columnas. Todo documento, antiguo o nuevo, tiene su texto en `content_markdown` (y la
-- edición en `edited_markdown`), así que no se pierde contenido.
--
-- Solo se puede aplicar con el frontend nuevo publicado: el anterior seleccionaba
-- `ai_document_types.sections` y dejaría de cargar los documentos.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_document_types
  DROP COLUMN IF EXISTS sections;

ALTER TABLE public.ai_generated_documents
  DROP COLUMN IF EXISTS content_sections,
  DROP COLUMN IF EXISTS edited_sections;
