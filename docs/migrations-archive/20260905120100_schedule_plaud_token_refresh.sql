-- Proactively refresh Plaud access tokens before they expire (see
-- refresh-plaud-tokens). Same pattern as refresh-google-drive-tokens, but
-- runs more often: Plaud access tokens last only ~3600s (vs Google's ~1h
-- which also happens to be ~3600s, but Plaud's refresh endpoint has not
-- been exercised in production yet, so a tighter buffer/cadence gives more
-- margin for a slow or failing refresh before the token actually expires).
--
-- Vault must contain a secret named plaud_token_refresh_cron_secret with the
-- same value as the Edge Function secret CRON_SECRET.
--
-- NOTE: refresh-plaud-tokens itself is a no-op whenever a connection has
-- enabled = false, so running this cron unconditionally is safe even before
-- the center owner turns the integration on.

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
