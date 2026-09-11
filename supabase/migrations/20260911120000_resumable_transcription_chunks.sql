-- Fase 2: permite reanudar la transcripcion despues de procesar un solo fragmento.
-- No modifica las migraciones anteriores ni cambia el contrato generico del proveedor STT.

ALTER TABLE public.transcription_jobs
  ADD COLUMN total_chunks integer,
  ADD COLUMN completed_chunk_count integer NOT NULL DEFAULT 0,
  ADD COLUMN transcript_chunks text[] NOT NULL DEFAULT ARRAY[]::text[];

COMMENT ON COLUMN public.transcription_jobs.total_chunks IS
  'Numero total de fragmentos de audio calculado al iniciar el procesamiento resumible.';
COMMENT ON COLUMN public.transcription_jobs.completed_chunk_count IS
  'Numero de fragmentos de audio transcritos y persistidos en transcript_chunks.';
COMMENT ON COLUMN public.transcription_jobs.transcript_chunks IS
  'Textos transcritos por fragmento, conservados en orden hasta crear el transcript final.';
