-- Process queued Wasender messages once per minute.
-- The function authenticates this request with vault secret "cron_secret".
DO $cron$
DECLARE
  base_url text := current_setting('app.settings.functions_url', true);
  anon_key text := current_setting('app.settings.anon_key', true);
BEGIN
  IF base_url IS NULL OR base_url = '' THEN
    RAISE NOTICE 'app.settings.functions_url sin definir: se omite el alta del cron de WhatsApp.';
  ELSE
    PERFORM cron.unschedule('wasender-process-queue-every-minute')
    WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'wasender-process-queue-every-minute'
    );

    PERFORM cron.schedule(
      'wasender-process-queue-every-minute',
      '* * * * *',
      format(
        $sql$SELECT net.http_post(
               url := %L,
               headers := jsonb_build_object(
                 'Content-Type','application/json',
                 'Authorization','Bearer '||%L,
                 'x-cron-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),'')
               ),
               body := '{}'::jsonb
             );$sql$,
        base_url || '/wasender-process-queue',
        COALESCE(anon_key, '')
      )
    );
  END IF;
END
$cron$;
