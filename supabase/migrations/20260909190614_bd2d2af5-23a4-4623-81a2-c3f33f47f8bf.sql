CREATE OR REPLACE FUNCTION public.weekly_db_maintenance()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_count bigint;
BEGIN
  -- audit_log: 180-day retention (does NOT touch audit_logs GDPR table)
  WITH d AS (
    DELETE FROM public.audit_log
    WHERE created_at < now() - interval '180 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{audit_log_purged}', to_jsonb(v_count));

  -- rate_limit_log: 7-day retention
  WITH d AS (
    DELETE FROM public.rate_limit_log
    WHERE created_at < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{rate_limit_purged}', to_jsonb(v_count));

  -- google_sync_debounce and google_sync_locks: >1 day
  WITH d AS (
    DELETE FROM public.google_sync_debounce
    WHERE created_at < now() - interval '1 day'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{google_sync_debounce_purged}', to_jsonb(v_count));

  WITH d AS (
    DELETE FROM public.google_sync_locks
    WHERE created_at < now() - interval '1 day'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{google_sync_locks_purged}', to_jsonb(v_count));

  -- email_send_log: 30-day retention
  WITH d AS (
    DELETE FROM public.email_send_log
    WHERE created_at < now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{email_send_log_purged}', to_jsonb(v_count));

  -- notifications: read >90 days
  WITH d AS (
    DELETE FROM public.notifications
    WHERE read_at IS NOT NULL
      AND read_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{notifications_purged}', to_jsonb(v_count));

  -- cron.job_run_details: 7 días de retención. pg_cron nunca la poda y llegó a
  -- ocupar 5.861 MB, el 91% del espacio del proyecto.
  WITH d AS (
    DELETE FROM cron.job_run_details
    WHERE start_time < now() - interval '7 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM d;
  v_result := jsonb_set(v_result, '{cron_run_details_purged}', to_jsonb(v_count));

  -- ANALYZE large tables
  ANALYZE public.sessions;
  ANALYZE public.calendar_events;
  ANALYZE public.audit_logs;
  ANALYZE public.whatsapp_messages;
  ANALYZE public.audit_log;
  ANALYZE cron.job_run_details;

  v_result := jsonb_set(v_result, '{ran_at}', to_jsonb(now()));
  RETURN v_result;
END;
$function$