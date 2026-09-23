-- Modelo de transcripción (speech-to-text) por centro, elegible en
-- Ajustes → Inteligencia Artificial. Separado de `openai_model`, que es el modelo
-- que redacta los informes: son catálogos distintos y se cambian por motivos distintos.
--
-- NULL = usar el valor por defecto del código (`DEFAULT_STT_MODEL`,
-- hoy gpt-4o-transcribe-diarize), para no tener que migrar filas cuando cambie.
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS stt_model text;

COMMENT ON COLUMN public.centers.stt_model IS
  'Modelo de transcripción de audio del centro (p. ej. gpt-4o-transcribe-diarize). NULL usa el valor por defecto de process-transcription-job.';
