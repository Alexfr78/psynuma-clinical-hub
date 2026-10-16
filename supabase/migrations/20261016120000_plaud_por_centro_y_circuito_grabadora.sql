-- Plaud vuelve, solo para los centros autorizados, y entra en el circuito de la grabadora.
--
-- 1. centers.plaud_enabled: interruptor por centro. Solo se cambia por SQL o desde el
--    servidor (service role); un usuario autenticado no puede activarlo ni al crear el centro.
-- 2. audio_ingestions acepta source 'plaud' (fila sin audio: Plaud solo entrega el texto).
-- 3. plaud_recordings.audio_ingestion_id enlaza la grabación con su fila del circuito, y
--    transcript_deleted_at impide que la ingesta vuelva a traer un texto borrado a mano y
--    promotion_claimed_at reserva la fila para que dos crons a la vez no la dupliquen.

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS plaud_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.centers.plaud_enabled IS
  'Plaud solo funciona en los centros con este valor a true. Se cambia por SQL; los usuarios no pueden modificarlo.';

CREATE OR REPLACE FUNCTION public.protect_centers_plaud_enabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Llamadas de usuarios (con JWT): el valor no cambia. SQL directo y service role, sí.
  IF auth.uid() IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.plaud_enabled := false;
    ELSE
      NEW.plaud_enabled := OLD.plaud_enabled;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_centers_plaud_enabled() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_centers_plaud_enabled ON public.centers;
CREATE TRIGGER protect_centers_plaud_enabled
  BEFORE INSERT OR UPDATE ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.protect_centers_plaud_enabled();

ALTER TABLE public.audio_ingestions DROP CONSTRAINT IF EXISTS audio_ingestions_source_check;
ALTER TABLE public.audio_ingestions ADD CONSTRAINT audio_ingestions_source_check
  CHECK (source IN ('android_recorder', 'samsung_media_store', 'share_target', 'manual_upload', 'web_recorder', 'plaud'));

ALTER TABLE public.plaud_recordings
  ADD COLUMN IF NOT EXISTS audio_ingestion_id uuid REFERENCES public.audio_ingestions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transcript_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS promotion_claimed_at timestamptz;

-- Una sola transcripción por grabación, aunque dos ejecuciones del cron se solapen.
CREATE UNIQUE INDEX IF NOT EXISTS transcripts_audio_ingestion_id_unique
  ON public.transcripts (audio_ingestion_id) WHERE audio_ingestion_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS plaud_recordings_pending_promotion_idx
  ON public.plaud_recordings (center_id, start_at DESC)
  WHERE status = 'matched' AND audio_ingestion_id IS NULL;
