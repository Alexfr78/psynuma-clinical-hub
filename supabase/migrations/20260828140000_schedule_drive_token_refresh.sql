-- Proactively refresh Google Drive access tokens before they expire (see
-- refresh-google-drive-tokens). Same pattern as process-payment-automation:
-- Vault must contain a secret named drive_token_refresh_cron_secret with the
-- same value as the Edge Function secret CRON_SECRET.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-google-drive-tokens') THEN
    PERFORM cron.unschedule('refresh-google-drive-tokens');
  END IF;
END $$;

SELECT cron.schedule(
  'refresh-google-drive-tokens',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/refresh-google-drive-tokens',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'drive_token_refresh_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
