-- Tabla principal de la Fase 2 de la integración Plaud: una fila por
-- grabación detectada en el dispositivo del centro, con el resultado de la
-- segmentación intra-archivo, la detección de solapamiento y el
-- emparejamiento contra la sesión agendada. La rellena exclusivamente
-- `sync-plaud-recordings` (service role); el frontend solo lee/actualiza vía
-- RLS para la bandeja de revisión que construye otro agente.
CREATE TABLE public.plaud_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,

  plaud_file_id TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  duration_ms BIGINT NOT NULL,
  serial_number TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'matched', 'needs_review', 'ignored', 'processed', 'error')),

  contains_multiple_sessions BOOLEAN NOT NULL DEFAULT false,
  segmentation_score NUMERIC,
  segmentation_signals JSONB,
  segment_boundaries JSONB,
  overlap_flag BOOLEAN NOT NULL DEFAULT false,
  overlap_with_file_id TEXT,

  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  match_confidence NUMERIC,
  match_reasons JSONB,
  matched_by TEXT CHECK (matched_by IN ('auto', 'manual')),
  confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,

  transcript_text TEXT,
  transcript_fetched_at TIMESTAMPTZ,
  transcript_expires_at TIMESTAMPTZ,

  report_generated_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (center_id, plaud_file_id)
);

COMMENT ON COLUMN public.plaud_recordings.transcript_text IS
  'Retención corta: se vacía automáticamente cuando pasa transcript_expires_at (ver cleanup-plaud-transcripts). Nunca almacenar el campo name de Plaud en ninguna columna de esta tabla.';

GRANT SELECT, UPDATE ON public.plaud_recordings TO authenticated;
GRANT ALL ON public.plaud_recordings TO service_role;

CREATE INDEX idx_plaud_recordings_center_status ON public.plaud_recordings(center_id, status);
CREATE INDEX idx_plaud_recordings_center_start_at ON public.plaud_recordings(center_id, start_at);
CREATE INDEX idx_plaud_recordings_session ON public.plaud_recordings(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_plaud_recordings_patient ON public.plaud_recordings(patient_id) WHERE patient_id IS NOT NULL;
CREATE INDEX idx_plaud_recordings_transcript_expiry ON public.plaud_recordings(transcript_expires_at)
  WHERE transcript_text IS NOT NULL;

CREATE TRIGGER update_plaud_recordings_updated_at
  BEFORE UPDATE ON public.plaud_recordings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.plaud_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View plaud recordings in center"
ON public.plaud_recordings FOR SELECT TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "Admins and professionals update plaud recordings in center"
ON public.plaud_recordings FOR UPDATE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE OR REPLACE FUNCTION public.cleanup_expired_plaud_transcripts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.cleanup_expired_plaud_transcripts() IS
  'Vacía transcript_text en plaud_recordings cuando pasa transcript_expires_at. Invocada por la edge function cleanup-plaud-transcripts vía cron.';