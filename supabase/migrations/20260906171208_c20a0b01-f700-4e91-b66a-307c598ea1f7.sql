-- lovable-cron-fallback-reviewed: 96 runs/day; Plaud access tokens expire in ~1h so a 15-minute refresh cadence is required to keep connections alive; the function is a no-op when no connection is enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-plaud-tokens') THEN
    PERFORM cron.unschedule('refresh-plaud-tokens');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-plaud-tokens',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/refresh-plaud-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'plaud_token_refresh_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);