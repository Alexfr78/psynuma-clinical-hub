## Problema

Al cambiar el estado de una sesión de **Cancelada → Confirmada** (u otro estado activo), el cambio no se sincroniza con Google Calendar, por lo que el evento sigue sin aparecer en el calendario aunque la cita esté reactivada en Psycma.

### Causa raíz

En `src/components/agenda/SessionDetailDrawer.tsx` (función `handleStatusChange`, líneas 399-414) y en `src/components/agenda/SessionDetailDialog.tsx` (líneas 64-83), el sync con Google Calendar **solo se ejecuta cuando `newStatus === 'cancelled'`**. No hay sincronización para el caso inverso (reactivación).

Cuando la sesión se canceló originalmente, `syncToGoogle({ status: 'cancelled' })` borró el evento en Google, pero `sessions.google_calendar_event_id` se mantiene en BD. Al cambiar a "confirmada", no se llama a Google, por lo que:
- No se actualiza el evento existente
- No se recrea el evento borrado

(He confirmado en BD que la sesión de hoy de Alejandro Macías está en `confirmed` con un `google_calendar_event_id` antiguo, sin actividad de sync reciente).

## Solución

Llamar a `syncToGoogle` también cuando se reactiva una sesión. El hook `useGoogleCalendarUpdate` ya maneja correctamente el caso de evento borrado: si el `update-google-calendar-event` recibe 404/410, recrea el evento y guarda el nuevo `google_calendar_event_id`.

### Cambios

**1. `src/components/agenda/SessionDetailDrawer.tsx`** (`handleStatusChange`)

Ampliar el bloque de sync para cubrir los demás estados:

```ts
if (newStatus === 'cancelled') {
  await syncToGoogle(session, { status: 'cancelled' });
} else if (session.status === 'cancelled' || !((session as any).google_calendar_event_id)) {
  // Reactivación desde cancelada o sesión sin evento: crear/recrear en Google
  await syncToGoogle(session, {});
} else {
  // Cambio entre estados activos: actualizar evento (mantiene título, etc.)
  await syncToGoogle(session, {});
}
```

En la práctica esto se puede simplificar a:
- Si `newStatus === 'cancelled'` → `syncToGoogle(session, { status: 'cancelled' })`
- En cualquier otro caso → `syncToGoogle(session, {})` (el hook se encarga de actualizar o recrear si el evento no existe).

**2. `src/components/agenda/SessionDetailDialog.tsx`** (`handleStatusChange`)

Actualmente no sincroniza con Google en absoluto. Añadir la misma lógica:
- Importar `useGoogleCalendarUpdate` con `session.professional_id`
- Tras `updateSession.mutateAsync`, llamar a `syncToGoogle` con la misma regla.

**3. (Opcional, recomendado)** En `useGoogleCalendarUpdate.tsx`, cuando `syncToGoogle` recibe `status: 'cancelled'` y borra el evento, limpiar también `google_calendar_event_id` en BD para que futuras reactivaciones tomen el camino de "crear nuevo evento" sin depender del fallback 404. No es imprescindible (el fallback ya funciona), pero deja el estado más limpio.

## Resultado esperado

Al pasar una cita de **Cancelada → Confirmada/Programada/Completada**, el evento se vuelve a crear en Google Calendar (o se actualiza si nunca llegó a borrarse), y el `google_calendar_event_id` queda alineado.