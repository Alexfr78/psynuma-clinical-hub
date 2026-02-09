
# Confirmaciones automaticas al paciente (crear/reprogramar/cancelar cita)

## Resumen
Implementar el envio automatico de un mensaje de confirmacion al paciente cuando se crea, reprograma o cancela una cita desde las 3 vias publicas/portal: `public-booking`, `patient-portal-sessions` y `public-session-reschedule`. Se reutiliza la infraestructura existente (`notifications` + `send-notification`).

## Arquitectura

El flujo sera:

1. Una Edge Function (public-booking, patient-portal-sessions, public-session-reschedule) completa la operacion principal (crear/reprogramar/cancelar)
2. Llama al helper compartido `queueAndSendPatientBookingNotification`
3. El helper determina el canal (WhatsApp automatico o Email), construye el mensaje, inserta en `notifications` y llama a `send-notification`
4. Si falla el envio, no se interrumpe la operacion principal

## Archivos a crear

### 1. `supabase/functions/_shared/bookingPatientNotifications.ts`

Helper compartido que exporta `queueAndSendPatientBookingNotification(args)`.

Logica interna:
- Carga datos del centro (name, portal_slug, custom_domain, public_domain, wasender_enabled, wasender_emergency_stop, wasender_confirm_booking, wasender_notify_cancellation, whatsapp_send_method, whatsapp_access_token, whatsapp_phone_number_id)
- Carga datos del paciente (first_name, last_name, email, phone)
- Opcionalmente carga datos de la sesion (session_date, start_time, session_type, session_modality, location)
- Determina canal preferido:
  - `canAutoWhatsApp` = (wasender_enabled AND NOT wasender_emergency_stop AND whatsapp_sessions.status='connected') OR (whatsapp_send_method='api' AND credenciales configuradas)
  - Si `whatsapp_send_method='web'` => canAutoWhatsApp = false
  - Para created/rescheduled: usa WhatsApp si canAutoWhatsApp AND patient.phone AND wasender_confirm_booking=true; si no, email
  - Para cancelled: usa WhatsApp si canAutoWhatsApp AND patient.phone AND wasender_notify_cancellation=true; si no, email
- Construye subject + message segun eventType (created/rescheduled/cancelled)
- Inserta en tabla `notifications` con status='pending'
- Invoca `send-notification` con el notificationId
- Todo envuelto en try/catch para no romper la operacion principal

## Archivos a modificar

### 2. `supabase/functions/public-booking/index.ts`

Insertar llamada al helper en 3 puntos:

- **create-booking** (linea ~1234, tras generar manageUrl): llamar con eventType='created' y manageUrl
- **reschedule-booking** (linea ~1657, tras exito del update): llamar con eventType='rescheduled', incluyendo oldDate/oldTime y newDate/newTime
- **cancel-booking** (linea ~1415, tras exito de la cancelacion): llamar con eventType='cancelled' y reason

### 3. `supabase/functions/patient-portal-sessions/index.ts`

- **create** (linea ~378, tras crear sesion): llamar con eventType='created'
- **cancel** (linea ~465, tras cancelar): llamar con eventType='cancelled' y reason

### 4. `supabase/functions/public-session-reschedule/index.ts`

- **reschedule** (linea ~344, tras exito del update y Google sync): llamar con eventType='rescheduled', incluyendo oldDate/oldTime y newDate/newTime
- **cancel** (linea ~467, tras exito de la cancelacion): llamar con eventType='cancelled' y cancellation_reason

## Detalles tecnicos

### Firma del helper

```text
queueAndSendPatientBookingNotification({
  supabase,           // Service role client
  centerId,           // string
  patientId,          // string
  sessionId,          // string
  eventType,          // 'created' | 'rescheduled' | 'cancelled'
  sessionDate?,       // string (YYYY-MM-DD)
  startTime?,         // string (HH:MM)
  sessionType?,       // string
  sessionModality?,   // string
  locationName?,      // string
  oldDate?,           // string (para rescheduled)
  oldTime?,           // string (para rescheduled)
  reason?,            // string (para cancelled)
  manageUrl?,         // string (URL relativa de gestion)
})
```

### Mensajes generados

- **created**: "Hola {Nombre}, tu cita en {Centro} ha quedado registrada. Fecha: {fecha} a las {hora}. Tipo: {tipo}. Modalidad: {modalidad}. {enlace de gestion si existe}"
- **rescheduled**: "Hola {Nombre}, tu cita en {Centro} ha sido reprogramada. Antes: {oldDate} a las {oldTime}. Ahora: {newDate} a las {newTime}."
- **cancelled**: "Hola {Nombre}, tu cita en {Centro} del {fecha} a las {hora} ha sido cancelada. {motivo si existe}"

### Seguridad y robustez

- El helper esta completamente envuelto en try/catch; si falla, solo loguea el error con prefijo `[patient-confirmation]`
- No se duplican notificaciones: solo se llama desde backend, nunca desde frontend
- No se modifica la logica de recordatorios existente (send-session-reminders)
- No se requieren migraciones de base de datos: las columnas `wasender_confirm_booking` y `wasender_notify_cancellation` ya existen en la tabla `centers`

### Edge Functions a redesplegar

- public-booking
- patient-portal-sessions
- public-session-reschedule
