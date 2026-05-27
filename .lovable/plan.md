## Objetivo
En el recordatorio de cita (enviado por email o WhatsApp), cuando la sesión sea de modalidad presencial (`in_person`), la dirección de la ubicación debe ser clickeable y abrir Google Maps.

## Cambios necesarios

### 1. Edge function `send-session-reminders/index.ts`

- **Añadir `session_modality`** al `select` de sesiones para poder detectar citas presenciales.
- **Añadir `number_details` y `postal_code`** al `select` de `location` para construir la dirección completa.
- **Actualizar `SessionToRemind` interface** con los nuevos campos.
- **Crear función `buildGoogleMapsUrl(location)`** que construya `https://www.google.com/maps/search/?api=1&query=<dirección>` a partir de `street`, `number_details`, `city`, `postal_code`.
- **Modificar `buildReminderMessage`**:
  - Si `session_modality === 'in_person'` y hay dirección, generar un enlace a Google Maps.
  - Para **email**: envolver la dirección en un `<a href="...">` clickeable (aprovechando la función `linkifyUrls` existente o añadiendo HTML directamente).
  - Para **WhatsApp**: incluir el enlace como texto plano (WhatsApp detecta URLs automáticamente).
  - Añadir nueva variable de template `{link_google_maps}` para que los usuarios puedan personalizar dónde aparece.

### 2. Frontend `src/hooks/useCommunicationTemplates.tsx`

- Añadir `{link_google_maps}` a `BOOKING_TEMPLATE_VARIABLES` y `TEMPLATE_VARIABLES` con descripción apropiada.
- Actualizar las plantillas por defecto de recordatorio (`reminder`) para incluir el enlace cuando aplique.

### 3. Deploy
- Redeploy de `send-session-reminders` edge function.

## Flujo resultante
1. El cron envía recordatorios como siempre.
2. Si la cita es presencial y tiene ubicación con dirección, el mensaje incluye un enlace a Google Maps.
3. El paciente recibe el email/WhatsApp y puede pulsar/clickar la dirección para verla en Google Maps.

## Notas técnicas
- El enlace se construye con `encodeURIComponent` sobre la dirección completa.
- Para email, se mantiene compatible con `linkifyUrls` existente.
- Para WhatsApp, las URLs son detectadas automáticamente por la app.