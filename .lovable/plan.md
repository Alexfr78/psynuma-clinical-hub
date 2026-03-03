

## Problema

La función `send-invoice-notification` tiene el mismo bug que ya se corrigió en `wasender-send-message`, `send-session-reminders` y `wasender-send-reminders`:

1. Usa el secret `WASENDER_API_KEY` en lugar del **session API key** de la tabla `whatsapp_sessions`
2. Solo selecciona `wasender_session_id` de la tabla, no el campo `api_key`
3. Pasa `sessionId` en el body del fetch, que el endpoint `/api/send-message` no acepta

Esto causa que WasenderAPI rechace la petición, el envío falla silenciosamente, y el sistema cae al fallback de WhatsApp Web.

## Solución

### Archivo: `supabase/functions/send-invoice-notification/index.ts`

Actualizar la función `sendWhatsAppViaWasender`:

1. Seleccionar `api_key` además de `wasender_session_id` de la tabla `whatsapp_sessions`
2. Si `api_key` es null, hacer fetch a WasenderAPI con el PAT para obtenerlo y persistirlo (mismo patrón que `wasender-send-message`)
3. Autenticar el `POST /api/send-message` con el session `api_key` en lugar de `WASENDER_API_KEY`
4. Eliminar `sessionId` del body del fetch (el endpoint solo espera `to` y `text`)

No se necesitan cambios en otros archivos ni migraciones.

