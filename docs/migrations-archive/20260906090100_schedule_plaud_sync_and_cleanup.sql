-- Programa la ingesta periódica de grabaciones Plaud y la limpieza de
-- transcripciones expiradas. Mismo patrón que
-- 20260905120100_schedule_plaud_token_refresh.sql: Vault debe contener un
-- secreto con el mismo valor que el secreto de Edge Function CRON_SECRET.
--
-- NOTA: tanto sync-plaud-recordings como cleanup-plaud-transcripts son no-op
-- seguros cuando no hay nada que hacer (sync-plaud-recordings ni siquiera
-- llama a Plaud para un centro con enabled = false; cleanup-plaud-transcripts
-- simplemente no actualiza ninguna fila si no hay transcripciones vencidas),
-- así que programar ambos crons sin condiciones es seguro incluso antes de
-- que ningún centro tenga la integración activada.

-- ---------------------------------------------------------------------
-- Ingesta: cada 15 minutos, mismo cadencia que refresh-plaud-tokens.
-- Vault: plaud_sync_cron_secret
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-plaud-recordings') THEN
    PERFORM cron.unschedule('sync-plaud-recordings');
  END IF;
END $$;

SELECT cron.schedule(
  'sync-plaud-recordings',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/sync-plaud-recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'plaud_sync_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- ---------------------------------------------------------------------
-- Limpieza de transcripciones expiradas: una vez al día basta, la
-- retención es de 30 días (margen amplio frente a cualquier hueco de
-- ejecución diario).
-- Vault: plaud_transcript_cleanup_cron_secret
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-plaud-transcripts') THEN
    PERFORM cron.unschedule('cleanup-plaud-transcripts');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-plaud-transcripts',
  '30 3 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/cleanup-plaud-transcripts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'plaud_transcript_cleanup_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
