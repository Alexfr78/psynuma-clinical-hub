

## Plan: Corregir reprogramación que ignora eventos de Google Calendar

### Problema
El sistema de reprogramación pública (`public-session-reschedule`) solo consulta la tabla `sessions` para detectar conflictos. No consulta la tabla `calendar_events`, por lo que eventos externos de Google Calendar (como "Maricongelada" que bloquea de 16:00 a 21:00 el día 12) son completamente ignorados. El paciente puede reprogramar su cita a un día bloqueado por eventos de Google.

El sistema de reservas públicas (`public-booking`) SÍ lo hace correctamente — hay que replicar esa lógica.

### Solución

**Archivo: `supabase/functions/public-session-reschedule/index.ts`**

Modificar las dos funciones clave para que también consulten `calendar_events`:

#### 1. `getAvailability()` (línea ~556)
Después de consultar las sesiones existentes (línea ~598), añadir una consulta a `calendar_events`:

```typescript
// Get calendar events (Google Calendar blocks) for this day
const dateStart = `${date}T00:00:00`;
const dateEnd = `${date}T23:59:59`;

const { data: calendarEvents } = await supabase
  .from("calendar_events")
  .select("start_at, end_at, status, all_day")
  .eq("professional_id", professionalId)
  .eq("is_converted", false)
  .is("deleted", null)
  .lte("start_at", dateEnd)
  .gte("end_at", dateStart);

// Add calendar events as booked slots (convert from timestamptz to time)
for (const evt of (calendarEvents || [])) {
  if (evt.all_day) {
    // All-day event blocks the entire day
    bookedSlots.push({ start: "00:00:00", end: "23:59:59" });
  } else {
    const evtStart = new Date(evt.start_at);
    const evtEnd = new Date(evt.end_at);
    // Convert to Europe/Madrid local time
    const startLocal = evtStart.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour12: false });
    const endLocal = evtEnd.toLocaleTimeString('en-GB', { timeZone: 'Europe/Madrid', hour12: false });
    bookedSlots.push({ start: startLocal, end: endLocal });
  }
}
```

#### 2. `checkDayHasAvailability()` (línea ~672)
Aplicar la misma lógica: después de obtener las sesiones existentes, consultar `calendar_events` y añadirlos como slots ocupados.

#### 3. Timezone
Los `calendar_events` almacenan `start_at`/`end_at` como `timestamptz` (UTC). Se necesita convertir a hora local de España (`Europe/Madrid`) para comparar correctamente con los horarios de disponibilidad (que están en hora local).

Usaremos el mismo approach que `public-booking`: extraer hora/minuto del timestamp convertido a zona horaria local.

### Resultado esperado
- El día 12 de marzo NO aparecerá como disponible (el evento "Maricongelada" bloquea 16:00-21:00, que es toda la ventana del profesional)
- Los eventos de todo el día bloquearán completamente el día
- Los eventos parciales solo bloquearán su franja horaria

### Archivos a modificar
- `supabase/functions/public-session-reschedule/index.ts` — funciones `getAvailability()` y `checkDayHasAvailability()`

