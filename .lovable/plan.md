
## Aclaración importante sobre archivos

En el enunciado mencionas `src/pages/PublicBookingManage.tsx` como el flujo del enlace público con `public-session-reschedule`. Tras revisar el código:

- **`PublicBookingManage.tsx`** usa `usePublicBooking` → edge function `public-booking` (gestión de citas creadas vía reserva pública del centro, `/book/:slug` con `?token=`).
- **`SessionManagement.tsx`** (ruta `/cita/:token`) usa `usePublicSessionReschedule` → edge function `public-session-reschedule` (enlaces que se envían al paciente para cualquier cita del sistema).

Asumiré que el flujo objetivo es **`SessionManagement.tsx` + `public-session-reschedule`** porque coincide con la edge function que listas y es el canal "universal". Si también quieres aplicarlo en `PublicBookingManage.tsx`, dímelo y lo añado (la lógica sería análoga).

## Cambios planeados

### 1. Backend — `public-session-reschedule/index.ts`
- Nueva acción `get-locations`: devuelve ubicaciones activas del centro de la sesión (id, name, location_type, street, number_details, city, postal_code).
- `get-available-days` y `get-availability`: aceptar `locationId?` opcional; si no llega, usar `session.location_id`. Validar que la ubicación pertenece al centro y está activa.
- `reschedule`: aceptar `newLocationId?` opcional. Validar: existe, mismo `center_id`, `is_active`. Si `location_type === 'online'`, fijar `session_modality = 'online'`; si presencial, `session_modality = 'in_person'` (manteniendo `zoom`/`google_meet` sólo si la ubicación original ya era online y no cambia). Actualizar `sessions.location_id` además de fechas.
- Tras update, llamar a `update-google-calendar-event` pasando también `locationId` para que el evento refleje la nueva dirección.
- Notificación: extender payload para incluir ubicación anterior y nueva (dirección completa o "Sesión online").

### 2. Backend — `patient-portal-sessions/index.ts`
- Acción `list-locations` ya existente o nueva (revisar): devolver ubicaciones del centro.
- `get-availability` y `get-month-availability`: aceptar `locationId` (ya lo aceptan parcialmente).
- `reschedule`: aceptar `newLocationId?`, mismas validaciones que arriba; actualizar `location_id` + `session_modality`; propagar a Google Calendar y notificación.

### 3. Backend — `update-google-calendar-event/index.ts`
- Aceptar opcional `locationId` o `locationOverride`. Si llega, buscar la ubicación y construir el string `location` del evento Google (`name, street number, city`) o "Online" si online. Hoy ya construye location desde `session.location_id` tras refetch; verificar que al cambiar `location_id` en DB antes de invocar, el evento se actualice correctamente. Ajustar si hace falta.

### 4. Frontend — `usePublicSession.tsx` (`usePublicSessionReschedule`)
- Añadir `locations`, `getLocations()`, y estado `selectedLocationId`.
- `getAvailability`/`getAvailableDays`/`reschedule` aceptan `locationId`.

### 5. Frontend — `usePatientPortal.tsx`
- `getAvailability`/`getMonthAvailability` ya aceptan `locationId`. Añadir `rescheduleSession(..., newLocationId?)` y `getLocations()` (o reutilizar existente del portal).

### 6. Frontend — `SessionManagement.tsx` (UI pública)
- Al entrar en modo "reprogramar":
  - Cargar lista de ubicaciones.
  - Selector de ubicación (preseleccionada la original).
  - Tarjeta informativa permanente con la ubicación seleccionada (nombre + dirección o "Sesión online").
  - Aviso amarillo si difiere de la original.
  - Al cambiar ubicación: `setSelectedDate(undefined)`, `setSelectedSlot(null)`, recargar días/slots con la nueva.
- Al confirmar: si `selectedLocationId !== original.location_id`, mostrar `AlertDialog` con: ubicación original, ubicación nueva, dirección, cambio de modalidad si procede. Botones "Volver" / "Confirmar cambio de ubicación". Sólo entonces ejecutar `reschedule`.

### 7. Frontend — `PortalBooking.tsx`
- Misma UX: selector de ubicación visible en modo reprogramar, tarjeta informativa, limpieza de fecha/hora al cambiar, diálogo de confirmación si cambia ubicación.

### 8. Lógica compartida
- Crear `src/lib/reschedule-helpers.ts` con: `formatLocationLine(location)`, `getModalityFromLocation(location)`, tipos `RescheduleLocation`.

## Modalidades del modelo

Valores existentes en `session_modality`: `in_person`, `online`, `zoom`, `google_meet`. Regla:
- Ubicación con `location_type === 'online'` → `online` (preservar `zoom`/`google_meet` si la cita original ya los tenía y la nueva ubicación también es online).
- Ubicación presencial → `in_person`.

## Criterios de aceptación cubiertos
Los 6 casos del enunciado quedan cubiertos con la combinación de: selector de ubicación + limpieza de slots + diálogo de confirmación + validaciones de backend (centro + activa + slot pertenece a la ubicación) + propagación a Google Calendar y notificaciones.

## Riesgos / fuera de alcance
- No se modifica `PublicBookingManage.tsx` salvo que lo confirmes.
- No se cambian las plantillas de WhatsApp/email; sólo se enriquece el payload pasado al sender con la ubicación nueva/anterior (si las plantillas no usan esos campos, no se mostrarán, pero el dato queda disponible para que lo añadas a la plantilla cuando quieras).
