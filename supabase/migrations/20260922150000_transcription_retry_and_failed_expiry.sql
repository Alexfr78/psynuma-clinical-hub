-- ---------------------------------------------------------------------------
-- 1. Los audios con transcripción fallida también caducan a los 7 días.
--
-- La versión anterior excluía status = 'failed', así que un audio cuya
-- transcripción fallaba no se borraba nunca, en contra de lo que promete el
-- consentimiento (v3, apartado 5: «como máximo a los 7 días»). Mientras sigue
-- dentro de esos 7 días se puede reintentar con retry_failed_transcription().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_orphan_audio_ingestions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_count integer;
BEGIN
  UPDATE public.audio_ingestions
  SET status = 'expired_unprocessed',
      updated_at = now()
  WHERE status NOT IN ('audio_deleted', 'expired_unprocessed')
    AND uploaded_at IS NOT NULL
    AND uploaded_at < (now() - interval '7 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.transcription_jobs tj
      WHERE tj.audio_ingestion_id = audio_ingestions.id
        AND tj.status = 'completed'
    );

  UPDATE public.audio_ingestions
  SET status = 'expired_unprocessed',
      updated_at = now()
  WHERE status = 'uploading'
    AND received_at < (now() - interval '7 days');

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  RETURN jsonb_build_object('expired', expired_count, 'timestamp', now());
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Reintento manual de una transcripción fallida.
--
-- Solo para audios que siguen guardados (fallidos, con storage_path y dentro
-- de los 7 días). Reinicia los intentos y deja el job en cola: el cron o una
-- llamada directa a process-transcription-job lo recoge. SECURITY DEFINER
-- porque las políticas RLS no permiten al cliente tocar transcription_jobs ni
-- las ingestiones de la grabadora web; los permisos se comprueban aquí.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_failed_transcription(p_audio_ingestion_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ingestion public.audio_ingestions%ROWTYPE;
  v_job_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_ingestion FROM public.audio_ingestions WHERE id = p_audio_ingestion_id FOR UPDATE;
  IF NOT FOUND
     OR v_ingestion.center_id IS DISTINCT FROM get_user_center_id(v_uid)
     OR NOT (is_admin(v_uid) OR (is_professional(v_uid) AND v_ingestion.professional_id = v_uid)) THEN
    RAISE EXCEPTION 'No tienes permiso para reintentar esta transcripción' USING ERRCODE = '42501';
  END IF;

  IF v_ingestion.status <> 'failed'
     OR v_ingestion.storage_path IS NULL
     OR v_ingestion.uploaded_at IS NULL
     OR v_ingestion.uploaded_at < now() - interval '7 days' THEN
    RAISE EXCEPTION 'El audio ya no está disponible para reintentar la transcripción' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.transcription_jobs
  SET status = 'queued',
      attempts = 0,
      next_retry_at = NULL,
      error_code = NULL,
      error_message_sanitized = NULL,
      started_at = NULL
  WHERE audio_ingestion_id = p_audio_ingestion_id
    AND status = 'failed'
  RETURNING id INTO v_job_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'No hay una transcripción fallida que reintentar' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.audio_ingestions
  SET status = 'queued_for_transcription', updated_at = now()
  WHERE id = p_audio_ingestion_id;

  RETURN v_job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.retry_failed_transcription(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_failed_transcription(uuid) TO authenticated;
