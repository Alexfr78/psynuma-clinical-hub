
-- 1.1 Purge historical no-op UPDATE rows from audit_log
DELETE FROM public.audit_log
WHERE action = 'UPDATE'
  AND (new_values - 'updated_at') = (old_values - 'updated_at');

-- 1.2 Replace audit_trigger_function to skip no-op UPDATEs
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD) - 'updated_at';
    v_new := to_jsonb(NEW) - 'updated_at';
    -- Skip no-op updates (only updated_at changed, or nothing changed)
    IF v_old = v_new THEN
      RETURN NEW;
    END IF;
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, old_values, new_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (user_id, table_name, action, record_id, old_values)
    VALUES (auth.uid(), TG_TABLE_NAME, TG_OP, OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 1.3 Indexes for efficient queries and purges
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON public.audit_log (table_name, record_id);

-- 1.4 Weekly maintenance function
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

  -- ANALYZE large tables
  ANALYZE public.sessions;
  ANALYZE public.calendar_events;
  ANALYZE public.audit_logs;
  ANALYZE public.whatsapp_messages;
  ANALYZE public.audit_log;

  v_result := jsonb_set(v_result, '{ran_at}', to_jsonb(now()));
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.weekly_db_maintenance() FROM public;
REVOKE ALL ON FUNCTION public.weekly_db_maintenance() FROM anon;
REVOKE ALL ON FUNCTION public.weekly_db_maintenance() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_db_maintenance() TO service_role;
