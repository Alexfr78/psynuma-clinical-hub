
-- Fix: Change auto-complete cron to run once daily at 08:00 UTC (10:00 Madrid)
-- This ensures it runs AFTER generate-pending-debts (06:00 UTC)
SELECT cron.unschedule('auto-complete-past-sessions');

SELECT cron.schedule(
  'auto-complete-past-sessions',
  '0 8 * * *',
  $$SELECT public.auto_complete_past_sessions();$$
);
