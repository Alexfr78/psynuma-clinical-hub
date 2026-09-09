-- lovable-cron-fallback-reviewed: 96 runs/day; Plaud ingestion must pick up new recordings within ~15 minutes so the review inbox is usable the same day, and the job is a no-op when no center has the integration enabled
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