

## Diagnostico y correccion: Sistema de recordatorios de cita

### Problemas identificados

He analizado a fondo el sistema y encontrado **3 problemas distintos**:

---

### Problema 1: Recordatorios duplicados con texto incorrecto

Hay **dos sistemas de recordatorios** que funcionan en paralelo y se pisan:

1. **Sistema antiguo** (`useScheduleSessionReminder` en `useNotifications.tsx`): Se ejecuta al crear una sesion desde `CreateSessionDialog` y `QuickCreateSessionDialog`. Genera recordatorios con un **texto fijo generico** que NO usa la plantilla configurada:
   > "Recordatorio: Tiene una cita programada para manana 19/03/2026 a las 19:00. Confirma su asistencia?"

2. **Sistema nuevo** (`send-session-reminders` edge function): Se ejecuta via cron cada hora. Usa la **plantilla configurada** de `communication_templates` con las variables correctas (`{nombre_paciente}`, `{profesional_nombre}`, etc.):
   > "Hola David, este es el recordatorio de sesion *primera consulta* con Alejandro el dia..."

El problema es que el sistema antiguo crea notificaciones `pending` con `scheduled_for` en el futuro (ej: dia anterior a las 9:00), pero estas **nunca se envian automaticamente** porque nadie las procesa. Quedan como "pendientes" para siempre.

Mientras tanto, el sistema nuevo (cron) SI envia correctamente, pero al intentar enviar via WasenderAPI falla (status `failed`) y luego crea un segundo registro como `pending` (fallback web). Resultado: **notificaciones duplicadas** por sesion.

---

### Problema 2: La edge function `send-session-reminders` no se ejecuta correctamente

Los logs muestran **0 registros** para `send-session-reminders`, lo que indica que la funcion falla silenciosamente o no se ejecuta bien. Pero los datos muestran que el 18/02 a las 10:00 SI se ejecuto (creo registros). El problema real es:

- El cron ejecuta cada hora (`0 * * * *`), pero la logica de `day_before_10am` solo procesa si la hora actual esta dentro de una ventana de 30 minutos de las 10:00 AM. Esto funciona correctamente.
- Sin embargo, la funcion usa la hora **UTC del servidor**, no la hora local del centro. Si el centro esta en zona horaria `Europe/Madrid` (UTC+1), las 10:00 AM locales son las 09:00 UTC. El cron se ejecuta a las 09:00 UTC, pero la funcion compara con las 10:00 UTC, por lo que el recordatorio se envia a las 11:00 hora local en lugar de las 10:00.

---

### Problema 3: Estados confusos en notificaciones

Los recordatorios del cron generan **dos registros** por intento de WhatsApp:
1. Primer intento via WasenderAPI -> `failed` (la API falla)
2. Fallback a modo web -> `pending` (queda como manual)

Esto causa confusion porque el usuario ve una notificacion `failed` y otra `pending` para la misma sesion/paciente.

---

### Solucion propuesta

#### Cambio 1: Eliminar el sistema antiguo de recordatorios

En `CreateSessionDialog.tsx` y `QuickCreateSessionDialog.tsx`, **eliminar** las llamadas a `useScheduleSessionReminder`. Este hook ya no debe usarse para programar recordatorios, ya que el cron se encarga automaticamente.

Archivos:
- `src/components/agenda/CreateSessionDialog.tsx` - quitar import y uso de `scheduleReminder`
- `src/components/agenda/QuickCreateSessionDialog.tsx` - quitar import y uso de `scheduleReminder`

#### Cambio 2: Corregir el texto del recordatorio en la edge function

Actualmente `send-session-reminders` ya usa las plantillas de `communication_templates`. El problema es que **solo busca la plantilla de WhatsApp** y la usa para todos los canales. Hay que asegurar que:
- Para WhatsApp: use la plantilla de `channel='whatsapp'` y `template_type='reminder'`
- Para Email: use la plantilla de `channel='email'` y `template_type='reminder'`

Archivo: `supabase/functions/send-session-reminders/index.ts`
- Buscar tambien la plantilla de email ademas de la de WhatsApp
- Usar la plantilla correcta para cada canal

#### Cambio 3: Evitar registros duplicados de notificacion

En `send-session-reminders`, cuando WasenderAPI falla y se cae al fallback web, el codigo actual crea un registro `failed` (del intento WasenderAPI) y luego otro `pending` (del fallback). Corregir para que:
- Si WasenderAPI falla, NO cree un registro `failed`
- Solo cree el registro del canal que finalmente se use (sea `sent`, `pending` o `failed`)

Archivo: `supabase/functions/send-session-reminders/index.ts` (lineas 548-632)

#### Cambio 4: Considerar zona horaria para `day_before_10am`

El modo `day_before_10am` deberia calcular las 10:00 AM en la zona horaria del centro, no en UTC. Como no hay un campo de zona horaria en la tabla `centers`, se puede asumir `Europe/Madrid` (el centro actual esta en Espana) o anadir un campo configurable.

Solucion pragmatica: ajustar la logica en la edge function para que use una zona horaria fija `Europe/Madrid` para la comparacion de las 10:00 AM.

Archivo: `supabase/functions/send-session-reminders/index.ts` (lineas 393-406)

---

### Resumen de archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/agenda/CreateSessionDialog.tsx` | Quitar `useScheduleSessionReminder` |
| `src/components/agenda/QuickCreateSessionDialog.tsx` | Quitar `useScheduleSessionReminder` |
| `supabase/functions/send-session-reminders/index.ts` | Buscar plantilla email, evitar duplicados, zona horaria |

### Detalles tecnicos

**Eliminacion del sistema antiguo**: El hook `useScheduleSessionReminder` en `useNotifications.tsx` se mantiene por ahora (no se borra), pero se dejan de llamar desde los dialogos de creacion. El cron es el unico responsable de enviar recordatorios.

**Logica de zona horaria en la edge function**:
```typescript
// Calcular las 10:00 AM en Europe/Madrid
const madridFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  hour: 'numeric',
  minute: 'numeric',
  hour12: false,
});
const madridParts = madridFormatter.formatToParts(now);
const madridHour = parseInt(madridParts.find(p => p.type === 'hour')?.value || '0');
const madridMinute = parseInt(madridParts.find(p => p.type === 'minute')?.value || '0');

// Solo procesar si estamos entre 09:30 y 10:30 hora Madrid
const totalMinutes = madridHour * 60 + madridMinute;
if (totalMinutes < 570 || totalMinutes > 630) {
  console.log(`Skipping: Madrid time is ${madridHour}:${madridMinute}`);
  continue;
}
```

**Prevencion de duplicados en WhatsApp**:
```typescript
// En vez de crear registro al fallar WasenderAPI, 
// solo pasar al siguiente metodo sin registrar
if (wasenderResult.success) {
  // Registrar exito
  await supabase.from("notifications").insert({ status: 'sent', ... });
  reminderSent = true;
} else {
  console.error(`WasenderAPI failed, trying next method...`);
  // NO crear registro failed aqui, dejar que el fallback lo maneje
}
```

