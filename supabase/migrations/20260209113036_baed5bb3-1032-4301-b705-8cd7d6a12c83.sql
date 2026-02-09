-- Schedule send-session-reminders to run every hour using pg_cron + pg_net
SELECT cron.schedule(
  'send-session-reminders-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/send-session-reminders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwcmtkeG1sdXZpcnhmaHN3cnpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzNDczMzAsImV4cCI6MjA4MDkyMzMzMH0.MpkCWpchHqZgdxcjTpB1uetABlygmgZnBbLQ5XekiFs"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);