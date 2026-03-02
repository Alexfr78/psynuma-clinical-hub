

## Problema real

El fix anterior (quitar `sessionId` del body) no era la causa raiz. El problema es que hay **dos endpoints distintos** de WasenderAPI en el codigo:

| Funcion | Endpoint | Token | Resultado |
|---------|----------|-------|-----------|
| `wasender-process-queue` | `/whatsapp-sessions/{id}/messages/text` | `WASENDER_PERSONAL_ACCESS_TOKEN` | Funciona correctamente |
| `send-session-reminders` | `/api/send-message` | `WASENDER_API_KEY` | "Esperando mensaje" |
| `send-notification` | `/api/send-message` | `WASENDER_API_KEY` | "Esperando mensaje" |
| `wasender-send-message` | `/api/send-message` | `WASENDER_API_KEY` | "Esperando mensaje" |
| `wasender-send-reminders` | `/api/send-message` | `WASENDER_API_KEY` | "Esperando mensaje" |

El endpoint `/api/send-message` con API Key envia a traves de la infraestructura cloud de WasenderAPI, no a traves de tu sesion real de WhatsApp Web. Por eso el telefono no puede descargar el contenido del mensaje.

El endpoint `/whatsapp-sessions/{sessionId}/messages/text` con Personal Access Token envia directamente a traves de tu sesion de WhatsApp Web vinculada, haciendo que el mensaje sea visible en tu conversacion del telefono.

## Solucion

Cambiar las 4 funciones para que usen el mismo endpoint y token que el queue processor:

**Endpoint**: `/whatsapp-sessions/{wasender_session_id}/messages/text`
**Auth**: `Bearer WASENDER_PERSONAL_ACCESS_TOKEN`

### Funciones a modificar

1. **`send-session-reminders/index.ts`** -- funcion `sendWhatsAppViaWasender` (lineas 9-54): cambiar endpoint y token
2. **`send-notification/index.ts`** -- funcion `sendWhatsAppViaWasender` (lineas 174-272): cambiar endpoint y token
3. **`wasender-send-message/index.ts`** -- envio directo (lineas 186-197): cambiar endpoint y token
4. **`wasender-send-reminders/index.ts`** -- envio (lineas 248-261): cambiar endpoint y token

### Cambio tipo (en cada funcion)

De:
```typescript
const wasenderApiKey = Deno.env.get("WASENDER_API_KEY");
// ...
fetch(`${WASENDER_API_URL}/send-message`, {
  headers: { "Authorization": `Bearer ${wasenderApiKey}` },
  body: JSON.stringify({ to, text: message }),
})
```

A:
```typescript
const wasenderToken = Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN");
// ...
fetch(`${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/messages/text`, {
  headers: { "Authorization": `Bearer ${wasenderToken}` },
  body: JSON.stringify({ to, text: message }),
})
```

Cada funcion ya tiene acceso al `wasender_session_id` a traves de la consulta a `whatsapp_sessions`, asi que solo hay que cambiar el endpoint, el nombre del secret, y pasar el session ID a la URL.

