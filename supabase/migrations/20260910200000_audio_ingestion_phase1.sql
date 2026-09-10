-- ---------------------------------------------------------------------------
-- Fase 1 de la nueva arquitectura de ingestión de audio (sustituye a PLAUD).
--
-- Capa de datos genérica, aislada de PLAUD: audio_ingestions, transcription_jobs,
-- transcripts, recording_commands. No toca ninguna tabla/función/policy de PLAUD
-- (plaud_recordings, center_plaud_connections, plaud_oauth_states siguen intactas).
--
-- Diseño ver auditoría e investigación previas (informe de arquitectura de
-- ingestión de audio Android, 20 secciones, 2026-09-10). Esta migración cubre
-- solo el modelo de datos y la limpieza automática; el adaptador STT real y la
-- migración del flujo actual (transcribe-session-audio / analyze-session-transcription)
-- son fases posteriores.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

CREATE TABLE public.audio_ingestions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  center_id uuid NOT NULL,
  professional_id uuid NOT NULL,
  patient_id uuid,
  session_id uuid,
  source text NOT NULL,
  device_installation_id text,
  recorded_at timestamp with time zone,
  received_at timestamp with time zone DEFAULT now() NOT NULL,
  duration_ms bigint,
  mime_type text,
  codec text,
  sample_rate integer,
  channels integer,
  size_bytes bigint,
  checksum text,
  storage_path text,
  status text DEFAULT 'uploading'::text NOT NULL,
  matching_status text DEFAULT 'pending'::text NOT NULL,
  expires_at timestamp with time zone,
  deleted_at timestamp with time zone,
  uploaded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT audio_ingestions_pkey PRIMARY KEY (id),
  CONSTRAINT audio_ingestions_source_check CHECK (
    source IN ('android_recorder', 'samsung_media_store', 'share_target', 'manual_upload')
  ),
  CONSTRAINT audio_ingestions_status_check CHECK (
    status IN (
      'uploading', 'uploaded', 'queued_for_transcription', 'transcription_processing',
      'transcription_verified', 'audio_deleted', 'expired_unprocessed', 'failed'
    )
  ),
  CONSTRAINT audio_ingestions_matching_status_check CHECK (
    matching_status IN ('pending', 'proposed', 'confirmed', 'rejected')
  )
);

COMMENT ON TABLE public.audio_ingestions IS
  'Ingestión genérica de audio de sesión (grabador Android, detector Samsung, Web Share Target o subida manual). Fase 1 de la sustitución de PLAUD — ver plaud_recordings para el flujo legado, que sigue activo en paralelo.';

CREATE TABLE public.transcription_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  audio_ingestion_id uuid NOT NULL,
  provider text,
  provider_model text,
  provider_job_id text,
  mode text DEFAULT 'sync'::text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  progress integer DEFAULT 0 NOT NULL,
  error_code text,
  error_message_sanitized text,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  next_retry_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT transcription_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT transcription_jobs_audio_ingestion_id_fkey FOREIGN KEY (audio_ingestion_id)
    REFERENCES public.audio_ingestions(id) ON DELETE CASCADE,
  CONSTRAINT transcription_jobs_mode_check CHECK (mode IN ('sync', 'async')),
  CONSTRAINT transcription_jobs_status_check CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT transcription_jobs_progress_check CHECK (progress BETWEEN 0 AND 100)
);

COMMENT ON TABLE public.transcription_jobs IS
  'Job de transcripción asociado a un audio_ingestion. No implementa todavía ningún proveedor STT real (Fase 2) — nace en estado queued.';

CREATE TABLE public.transcripts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  session_id uuid,
  patient_id uuid,
  center_id uuid NOT NULL,
  audio_ingestion_id uuid,
  source text,
  language text,
  diarization_available boolean DEFAULT false NOT NULL,
  normalized_text text,
  segments jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT transcripts_pkey PRIMARY KEY (id),
  CONSTRAINT transcripts_audio_ingestion_id_fkey FOREIGN KEY (audio_ingestion_id)
    REFERENCES public.audio_ingestions(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.transcripts IS
  'Transcripción normalizada, independiente del proveedor STT. audio_ingestion_id es solo trazabilidad: el audio en sí NUNCA se conserva aquí. Se retiene 30 días (expires_at) y después se vacía vía cleanup_expired_transcripts().';

CREATE TABLE public.recording_commands (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  professional_id uuid NOT NULL,
  device_installation_id text NOT NULL,
  command text NOT NULL,
  issued_at timestamp with time zone DEFAULT now() NOT NULL,
  acknowledged_at timestamp with time zone,
  expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
  CONSTRAINT recording_commands_pkey PRIMARY KEY (id),
  CONSTRAINT recording_commands_command_check CHECK (command IN ('stop', 'pause', 'resume'))
);

COMMENT ON TABLE public.recording_commands IS
  'Cola de comandos para controlar el grabador Android auxiliar desde la PWA (Fase 3, app Android). Solo la tabla por ahora — sin edge function que la consuma todavía.';

-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------

CREATE INDEX idx_audio_ingestions_center_id ON public.audio_ingestions USING btree (center_id);
CREATE INDEX idx_audio_ingestions_professional_id ON public.audio_ingestions USING btree (professional_id);
CREATE INDEX idx_audio_ingestions_session_id ON public.audio_ingestions USING btree (session_id);
CREATE INDEX idx_audio_ingestions_status ON public.audio_ingestions USING btree (status);
CREATE INDEX idx_audio_ingestions_expires_at ON public.audio_ingestions USING btree (expires_at)
  WHERE (status <> 'audio_deleted'::text);

CREATE INDEX idx_transcription_jobs_audio_ingestion_id ON public.transcription_jobs USING btree (audio_ingestion_id);
CREATE INDEX idx_transcription_jobs_status ON public.transcription_jobs USING btree (status);

CREATE INDEX idx_transcripts_center_id ON public.transcripts USING btree (center_id);
CREATE INDEX idx_transcripts_session_id ON public.transcripts USING btree (session_id);
CREATE INDEX idx_transcripts_audio_ingestion_id ON public.transcripts USING btree (audio_ingestion_id);
CREATE INDEX idx_transcripts_expires_at ON public.transcripts USING btree (expires_at)
  WHERE (normalized_text IS NOT NULL);

CREATE INDEX idx_recording_commands_professional_id ON public.recording_commands USING btree (professional_id);
CREATE INDEX idx_recording_commands_device_installation_id ON public.recording_commands USING btree (device_installation_id);

-- ---------------------------------------------------------------------------
-- 3. Triggers (updated_at) — reutiliza update_updated_at_column() ya existente
-- ---------------------------------------------------------------------------

CREATE TRIGGER update_audio_ingestions_updated_at BEFORE UPDATE ON public.audio_ingestions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transcription_jobs_updated_at BEFORE UPDATE ON public.transcription_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 4. RLS — mismo patrón restrictivo que plaud_recordings: scoping por center_id,
--    solo admin/profesional del propio centro, sin GRANT amplio a anon.
-- ---------------------------------------------------------------------------

ALTER TABLE public.audio_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recording_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View audio ingestions in center" ON public.audio_ingestions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals update audio ingestions in center" ON public.audio_ingestions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))))
  WITH CHECK (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals delete audio ingestions in center" ON public.audio_ingestions AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

-- Sin policy de INSERT para authenticated: las ingestiones se crean únicamente
-- desde create-audio-ingestion (service_role), que ya valida centro/profesional
-- en el propio edge function antes de escribir.

CREATE POLICY "View transcription jobs in center" ON public.transcription_jobs AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.audio_ingestions ai
      WHERE ai.id = transcription_jobs.audio_ingestion_id
        AND ai.center_id = get_user_center_id(auth.uid())
        AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    )
  );

CREATE POLICY "View transcripts in center" ON public.transcripts AS PERMISSIVE FOR SELECT TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Admins and professionals delete transcripts in center" ON public.transcripts AS PERMISSIVE FOR DELETE TO authenticated
  USING (((center_id = get_user_center_id(auth.uid())) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))));

CREATE POLICY "Professionals view own pending recording commands" ON public.recording_commands AS PERMISSIVE FOR SELECT TO authenticated
  USING ((professional_id = auth.uid()));

-- transcription_jobs y transcripts no tienen policy de INSERT/UPDATE para
-- authenticated: los escribe exclusivamente el backend (service_role) desde
-- complete-audio-upload y el futuro adaptador STT (Fase 2).
-- recording_commands tampoco: la emitirá la PWA vía un edge function propio
-- cuando exista (Fase 3), no directamente desde el cliente.

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.audio_ingestions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.audio_ingestions TO service_role;

GRANT SELECT ON TABLE public.transcription_jobs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.transcription_jobs TO service_role;

GRANT DELETE, SELECT, REFERENCES, TRIGGER ON TABLE public.transcripts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.transcripts TO service_role;

GRANT SELECT ON TABLE public.recording_commands TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, UPDATE ON TABLE public.recording_commands TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Bucket privado de audio (nuevo, independiente de los buckets existentes)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public) VALUES
  ('session-audio', 'session-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Sin policies de storage.objects para authenticated/anon a propósito: todo el
-- acceso (subida vía URL firmada, lectura, borrado) pasa por edge functions
-- con service_role, que ya validan centro/profesional antes de generar la URL.
-- Esto evita exponer el bucket a políticas RLS más permisivas de lo necesario
-- para un dato tan sensible como el audio de sesión.

-- ---------------------------------------------------------------------------
-- 6. Funciones de limpieza automática (mismo patrón que
--    cleanup_expired_plaud_transcripts: SECURITY DEFINER, devuelve jsonb con
--    el recuento, sin loguear contenido clínico).
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
  -- Ventana de 7 días desde uploaded_at si el job de transcripción no se
  -- completó: se marca como expired_unprocessed y se libera el storage_path
  -- (el borrado físico del objeto en Storage lo hace el edge function
  -- cleanup-audio-ingestions tras leer estas filas, ya que SQL no puede
  -- borrar objetos de storage.objects con service_role de Postgres).
  UPDATE public.audio_ingestions
  SET status = 'expired_unprocessed',
      updated_at = now()
  WHERE status NOT IN ('audio_deleted', 'expired_unprocessed', 'failed')
    AND uploaded_at IS NOT NULL
    AND uploaded_at < (now() - interval '7 days')
    AND NOT EXISTS (
      SELECT 1 FROM public.transcription_jobs tj
      WHERE tj.audio_ingestion_id = audio_ingestions.id
        AND tj.status = 'completed'
    );

  -- Uploads que nunca llegaron a completarse (siguen en 'uploading' pasado el
  -- mismo plazo) se tratan igual: quedan disponibles para que el edge function
  -- de limpieza libere cualquier objeto parcial en Storage.
  UPDATE public.audio_ingestions
  SET status = 'expired_unprocessed',
      updated_at = now()
  WHERE status = 'uploading'
    AND received_at < (now() - interval '7 days');

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  RETURN jsonb_build_object('expired', expired_count, 'timestamp', now());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_transcripts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  cleared_count integer;
BEGIN
  UPDATE public.transcripts
  SET normalized_text = NULL,
      segments = NULL,
      deleted_at = now()
  WHERE normalized_text IS NOT NULL
    AND expires_at < now()
    AND deleted_at IS NULL;

  GET DIAGNOSTICS cleared_count = ROW_COUNT;

  RETURN jsonb_build_object('cleared', cleared_count, 'timestamp', now());
END;
$function$
;

REVOKE ALL ON FUNCTION public.cleanup_orphan_audio_ingestions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_audio_ingestions() TO PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.cleanup_expired_transcripts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_transcripts() TO PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Cron jobs — mismo patrón net.http_post + secreto de vault que el resto
--    de crons del proyecto. Usa el secreto genérico `cron_secret` (el mismo
--    que ya usan send-payment-reminders, sync-google-calendar, etc.), NO los
--    secretos específicos de PLAUD (plaud_token_refresh_cron_secret y
--    similares), que quedan reservados a esa integración.
-- ---------------------------------------------------------------------------

DO $cron$
DECLARE
  base_url text := current_setting('app.settings.functions_url', true);
  anon_key text := current_setting('app.settings.anon_key', true);

  jobs CONSTANT jsonb := '[
    {"name":"cleanup-audio-ingestions", "sched":"15 3 * * *", "fn":"cleanup-audio-ingestions", "secret":"cron_secret"},
    {"name":"cleanup-transcripts",      "sched":"45 3 * * *", "fn":"cleanup-transcripts",      "secret":"cron_secret"}
  ]'::jsonb;

  j jsonb;
BEGIN
  IF base_url IS NULL OR base_url = '' THEN
    RAISE NOTICE 'app.settings.functions_url sin definir: se omite el alta de crons HTTP de audio_ingestions.';
  ELSE
    FOR j IN SELECT * FROM jsonb_array_elements(jobs) LOOP
      PERFORM cron.unschedule(j->>'name') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = j->>'name');
      PERFORM cron.schedule(
        j->>'name',
        j->>'sched',
        format(
          $sql$SELECT net.http_post(
                 url := %L,
                 headers := jsonb_build_object(
                   'Content-Type','application/json',
                   'Authorization','Bearer '||%L,
                   'x-cron-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = %L LIMIT 1),'')
                 ),
                 body := '{}'::jsonb
               );$sql$,
          base_url || '/' || (j->>'fn'),
          COALESCE(anon_key,''),
          COALESCE(j->>'secret','')
        )
      );
    END LOOP;
  END IF;
END
$cron$;
