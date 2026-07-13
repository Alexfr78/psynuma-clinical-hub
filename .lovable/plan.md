## Diagnóstico

Zeus Lara confirmó su sesión de mañana desde el enlace público `/cita/:token` (el que llega en el recordatorio de WhatsApp), no respondiendo "SÍ" por WhatsApp.

- El estado en base de datos sí se actualizó a `confirmed` a las 08:06 (verificado en la BD).
- Pero el flujo que usa esa página (`useUpdatePublicSession` en `src/hooks/usePublicSession.tsx`) actualiza la tabla `sessions` **directamente desde el navegador** con un token, y **nunca invoca** `update-google-calendar-event`. Por eso el evento en Google Calendar no cambia al color verde salvia.

En cambio:
- La confirmación por respuesta "SÍ" en WhatsApp (`wasender-webhook`) sí llama a `update-google-calendar-event` con `color_id: "2"`.
- La confirmación desde la UI interna (agenda/drawer) también sincroniza vía `useGoogleCalendarUpdate.syncToGoogle`.

Solo falta el camino público del paciente.

## Cambios

1. **`supabase/functions/public-session-reschedule/index.ts`** — añadir una nueva `action: "confirm"` que:
   - Valide el token (misma verificación que ya usan `reschedule`/`cancel`).
   - Actualice `sessions.status = 'confirmed'` con service role.
   - Si la sesión tiene `google_calendar_event_id`, llame a `update-google-calendar-event` con `color_id: "2"` y `psycma_session_id`, replicando el patrón del bloque `reschedule` (líneas 605–625) y del webhook de Wasender.
   - Devuelva la fila actualizada.

2. **`src/hooks/usePublicSession.tsx`** — reescribir `useUpdatePublicSession` para que, cuando `status === 'confirmed'`, invoque la nueva acción del edge function en lugar del `UPDATE` directo. Los otros estados (`cancelled`, `reschedule_requested`) siguen usando sus flujos actuales (la cancelación ya está cubierta por `action: "cancel"` en el edge function; conviene alinearla también si no lo está).

3. No se toca la UI de `SessionManagement.tsx` — sigue llamando a `updateSession.mutate({ token, status: 'confirmed' })`.

## Notas técnicas

- El edge function ya tiene `SUPABASE_SERVICE_ROLE_KEY` y `supabaseUrl` disponibles y ya sabe hacer fetch a `update-google-calendar-event` (bloque de reschedule).
- No hace falta migración de BD.
- No hay cambios en logs ni en el webhook de Wasender.
- Retroactivo para Zeus: una vez desplegado, se puede forzar la sincronización volviendo a poner la sesión en "Programada" y luego "Confirmada" desde la agenda, o simplemente esperando al siguiente cambio; opcionalmente puedo lanzar una llamada puntual al edge function para su evento actual.
