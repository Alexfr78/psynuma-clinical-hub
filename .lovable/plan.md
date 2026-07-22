
## Decisiones confirmadas
- **Opción B**: mantener triggers pero filtrar UPDATE no-op.
- **Retención de `audit_log`**: 180 días.
- **`audit_logs` (GDPR/HIPAA)**: no se toca, se conserva íntegro.

## Plan

### 1. Migración de limpieza + hardening (una sola migración)

```sql
-- 1.1 Borrar UPDATEs no-op históricos (~184k filas)
DELETE FROM public.audit_log
WHERE action = 'UPDATE'
  AND (new_values - 'updated_at') = (old_values - 'updated_at');

-- 1.2 Reemplazar audit_trigger_function para ignorar UPDATEs sin cambios reales
CREATE OR REPLACE FUNCTION public.audit_trigger_function() ...
  -- En TG_OP='UPDATE': si (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') RETURN NULL;

-- 1.3 Índices para consultas y purga eficientes
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_record
  ON public.audit_log(table_name, record_id);

-- 1.4 Función de mantenimiento semanal
CREATE OR REPLACE FUNCTION public.weekly_db_maintenance()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb := '{}'::jsonb;
BEGIN
  -- audit_log: retención 180 días (NO toca audit_logs GDPR)
  WITH d AS (DELETE FROM audit_log WHERE created_at < now() - interval '180 days' RETURNING 1)
  SELECT jsonb_set(r,'{audit_log_purged}', to_jsonb(count(*))) INTO r FROM d;

  -- rate_limit_log: >7 días
  WITH d AS (DELETE FROM rate_limit_log WHERE created_at < now() - interval '7 days' RETURNING 1)
  SELECT jsonb_set(r,'{rate_limit_purged}', to_jsonb(count(*))) INTO r FROM d;

  -- google_sync_debounce y google_sync_locks expirados >1 día
  DELETE FROM google_sync_debounce WHERE created_at < now() - interval '1 day';
  DELETE FROM google_sync_locks    WHERE created_at < now() - interval '1 day';

  -- email_send_log >30 días
  DELETE FROM email_send_log WHERE created_at < now() - interval '30 days';

  -- notifications leídas >90 días
  DELETE FROM notifications WHERE read_at IS NOT NULL AND read_at < now() - interval '90 days';

  -- ANALYZE de tablas grandes
  ANALYZE public.sessions;
  ANALYZE public.calendar_events;
  ANALYZE public.audit_logs;
  ANALYZE public.whatsapp_messages;
  ANALYZE public.audit_log;

  RETURN r;
END;$$;

REVOKE ALL ON FUNCTION public.weekly_db_maintenance() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.weekly_db_maintenance() TO service_role;
```

Tras el DELETE masivo se ejecutará `VACUUM (ANALYZE) public.audit_log` (fuera de la migración transaccional, con el tool `insert`) para reclamar espacio.

### 2. Cron semanal (vía `supabase--insert`, no migración)

Domingos 04:00 UTC (~06:00 Europa/Madrid):

```sql
select cron.schedule(
  'weekly-db-maintenance',
  '0 4 * * 0',
  $$ select public.weekly_db_maintenance(); $$
);
```

Se registra con el tool `insert` para no exponer claves en el historial de migraciones (los cron jobs de HTTP van con `net.http_post`; este es local, sin secretos, pero mantengo la convención).

### 3. Verificación
- Confirmar tamaño de `audit_log` cae de 569 MB a <10 MB tras VACUUM.
- Confirmar que un UPDATE trivial de `sessions` (p.ej. tocar `updated_at`) ya no genera fila en `audit_log`, pero sí en `audit_logs` GDPR si el cambio es clínico.
- `SELECT * FROM cron.job WHERE jobname='weekly-db-maintenance'` confirma programación.
- Tras la primera ejecución, revisar `cron.job_run_details` sin errores.

### Tablas intocadas
- `audit_logs` (GDPR/HIPAA, hash-chain)
- `verifactu_records`, `verifactu_events`, `verifactu_chain_status` (obligación fiscal AEAT)
- `invoices`, `invoice_items`, `payments`, `debts`, `consent_signatures` (datos fiscales/clínicos)

