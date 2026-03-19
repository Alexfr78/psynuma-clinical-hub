

## Diagnóstico de la sincronización Google Calendar

### Hallazgos

**1. La sincronización SÍ se ejecutó hoy a las 07:23 y reporta éxito** (40 eventos actualizados, 0 errores). Sin embargo, hay discrepancias visibles entre Psycma y Google Calendar.

**2. Bug en formato de fecha/hora en `update-google-calendar-event`**
Cuando la función recibe `start_time` del DB (formato `16:00:00`), le añade `:00`, produciendo `2026-03-26T16:00:00:00` — un formato ISO 8601 **inválido**. Google acepta la petición PATCH (200 OK) pero probablemente ignora los campos start/end malformados, por lo que el evento NO se mueve de fecha. Esto explica por qué Alejandro Macías aparece en jueves en Psycma pero sigue en martes en Google.

La función de sincronización completa (`sync-google-calendar`) NO tiene este bug — usa el formato correcto. Pero si hay problemas de timing entre updates individuales y el sync completo, pueden quedar discrepancias.

**3. El trigger de anti-solapamiento puede bloquear silenciosamente actualizaciones Google→Psycma**
En modo two-way sync, cuando Google es más reciente, el código actualiza la sesión en Psycma sin verificar si el trigger `validate_no_session_overlap` bloquea la operación. El error se ignora silenciosamente.

**4. Eventos externos de otros calendarios no se importan**
El sync solo importa eventos del calendario configurado (`c598f...@group.calendar.google.com`). Los eventos que ves en Google (Rehabilitación, Criolisis, CARLOS LONDRES, etc.) están probablemente en tu calendario primario u otros, por lo que no aparecen como bloqueados en Psycma.

---

## Plan de corrección

### 1. Corregir formato de fecha/hora en `update-google-calendar-event`
Detectar si `start_time` ya contiene segundos (`HH:MM:SS`) antes de añadir `:00`. Esto garantiza que los updates individuales (mover sesiones, drag-and-drop) envíen el formato correcto a Google.

**Archivo**: `supabase/functions/update-google-calendar-event/index.ts`

### 2. Manejar errores del trigger de solapamiento en el sync two-way
En `sync-google-calendar`, capturar errores de la actualización Google→Psycma y registrarlos en lugar de ignorarlos silenciosamente.

**Archivo**: `supabase/functions/sync-google-calendar/index.ts`

### 3. Forzar re-sync inmediato
Tras corregir el código, la próxima vez que hagas clic en "Sincronizar", los eventos se actualizarán correctamente en Google con las fechas correctas.

