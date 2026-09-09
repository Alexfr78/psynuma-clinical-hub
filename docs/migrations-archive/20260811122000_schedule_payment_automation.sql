-- One recurring payment job handles:
-- - scheduled payment-link delivery;
-- - advance-payment deadlines and optional cancellation;
-- - Stripe reconciliation as a webhook safety net.
--
-- Before this job can authenticate, Supabase Vault must contain a secret named
-- payment_automation_cron_secret with the same value as the Edge Function
-- secret CRON_SECRET.
-- Lovable Cloud provisions pg_cron, pg_net and Vault. Re-running CREATE
-- EXTENSION from its SQL editor can fail while its managed privilege hook
-- attempts to grant permissions that already exist, so this migration only
-- configures the job itself.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-payment-automation') THEN
    PERFORM cron.unschedule('process-payment-automation');
  END IF;
END $$;

SELECT cron.schedule(
  'process-payment-automation',
  '*/10 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/process-advance-payment-deadlines',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'payment_automation_cron_secret'
          LIMIT 1
        ),
        ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
