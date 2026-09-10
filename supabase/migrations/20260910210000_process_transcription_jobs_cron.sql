-- Fase 2: procesa periódicamente los jobs de transcripción pendientes.
-- Reutiliza el secreto genérico cron_secret de Fase 1.
--
-- Usa la URL literal del proyecto en vez de current_setting('app.settings.functions_url'):
-- esa variable no está definida en el entorno de despliegue (Lovable/Supabase),
-- lo que hacía que el bloque equivalente de la Fase 1 se saltara el alta del
-- cron con un NOTICE y hubo que programarlo a mano después del despliegue.
-- Ver memoria de proyecto "lovable-supabase-edge-function-deploy".

DO $cron$
BEGIN
  PERFORM cron.unschedule('process-transcription-jobs-cron')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-transcription-jobs-cron');
  PERFORM cron.schedule(
    'process-transcription-jobs-cron',
    '*/5 * * * *',
    $sql$SELECT net.http_post(
           url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/process-transcription-job',
           headers := jsonb_build_object(
             'Content-Type','application/json',
             'x-cron-secret', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),'')
           ),
           body := '{}'::jsonb
         );$sql$
  );
END
$cron$;
