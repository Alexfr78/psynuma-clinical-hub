

## Problema identificado

La sesion de Ulises (19:00 manana) fue reprogramada del 24 de febrero al 3 de marzo. El campo `reminder_sent_at` conserva el valor del 23 de febrero (cuando se envio el recordatorio para la fecha antigua), por lo que el sistema cree que ya se envio el recordatorio y la omite.

**Sesiones de manana (3 de marzo):**
- Zeus 18:00 -- recordatorio enviado correctamente hoy
- Ulises 19:00 -- **sin recordatorio** (reprogramada, `reminder_sent_at` no se reseteo)
- [Bloqueado] 20:00 -- sin telefono, no aplica

## Plan de solucion

### 1. Fix estructural: resetear `reminder_sent_at` al reprogramar

Crear un trigger en la base de datos que resetee `reminder_sent_at` a `NULL` cuando cambia `session_date` o `start_time`:

```sql
CREATE OR REPLACE FUNCTION reset_reminder_on_reschedule()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.session_date IS DISTINCT FROM NEW.session_date)
     OR (OLD.start_time IS DISTINCT FROM NEW.start_time) THEN
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reset_reminder_on_reschedule
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION reset_reminder_on_reschedule();
```

### 2. Fix inmediato: enviar el recordatorio pendiente de Ulises

Resetear manualmente `reminder_sent_at` para la sesion de Ulises y disparar el cron de recordatorios en modo forzado para que lo procese.

### Cambios necesarios

- **1 migracion SQL**: trigger `reset_reminder_on_reschedule`
- **1 operacion de datos**: resetear `reminder_sent_at` para la sesion `a6d1f3dc` de Ulises
- **1 invocacion**: llamar a `send-session-reminders` con `force: true`

No se requieren cambios en el frontend ni en edge functions.

