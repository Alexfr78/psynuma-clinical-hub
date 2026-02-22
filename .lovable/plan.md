## Correccion: Recordatorios WhatsApp no se envian via WasenderAPI

### Diagnostico

Los recordatorios de cita **si se estan generando** correctamente a las 10:00 hora Madrid (09:00 UTC). Sin embargo, el envio automatico via WhatsApp (WasenderAPI) esta fallando **desde hace al menos una semana** con este error:

```
Unexpected token '<', "<!DOCTYPE "... is not valid JSON
```

Esto significa que la API de Wasender esta devolviendo una pagina HTML (error 404 o similar) en vez de una respuesta JSON.

### Causa raiz

La funcion `send-session-reminders` usa un **endpoint y formato de peticion incorrecto** para WasenderAPI, diferente al que usan las demas funciones que SI funcionan:


| &nbsp;       | `send-session-reminders` (ROTO)             | `wasender-send-message` (FUNCIONA) |
| ------------ | ------------------------------------------- | ---------------------------------- |
| **Endpoint** | `/api/whatsapp-sessions/{id}/messages/text` | `/api/send-message`                |
| **Body**     | `{ to, text }`                              | `{ sessionId, to, text }`          |
| **Token**    | `WASENDER_PERSONAL_ACCESS_TOKEN`            | `WASENDER_API_KEY`                 |


El endpoint `/whatsapp-sessions/{id}/messages/text` no existe en la API de Wasender (devuelve HTML), y el body no incluye el `sessionId` necesario.

### Solucion

Corregir la funcion `sendWhatsAppViaWasender` dentro de `send-session-reminders/index.ts` para que:

1. Use el endpoint correcto: `${WASENDER_API_URL}/send-message`
2. Incluya `sessionId` en el body de la peticion
3. Use `WASENDER_API_KEY` (igual que las demas funciones) en vez de `WASENDER_PERSONAL_ACCESS_TOKEN`
4. Valide que la respuesta sea JSON antes de parsearla (como hace `wasender-send-message`)

### Cambios tecnicos

**Archivo: `supabase/functions/send-session-reminders/index.ts**`

Cambiar la funcion `sendWhatsAppViaWasender` (lineas 9-46):

```typescript
// ANTES (roto):
const response = await fetch(
  `${WASENDER_API_URL}/whatsapp-sessions/${wasenderSessionId}/messages/text`,
  {
    headers: { 'Authorization': `Bearer ${wasenderToken}` },
    body: JSON.stringify({ to: cleanPhone, text: message }),
  }
);
const data = await response.json(); // Falla: respuesta es HTML

// DESPUES (corregido):
const response = await fetch(
  `${WASENDER_API_URL}/send-message`,
  {
    headers: { 'Authorization': `Bearer ${wasenderApiKey}` },
    body: JSON.stringify({ sessionId: wasenderSessionId, to: cleanPhone, text: message }),
  }
);
// Validar que sea JSON antes de parsear
const contentType = response.headers.get("content-type");
if (!contentType || !contentType.includes("application/json")) {
  const textResponse = await response.text();
  return { success: false, error: `Invalid response: ${textResponse.substring(0, 200)}` };
}
const data = await response.json();
```

Tambien cambiar donde se obtiene el token (linea 557):

- De: `Deno.env.get("WASENDER_PERSONAL_ACCESS_TOKEN")`
- A: `Deno.env.get("WASENDER_API_KEY")`

### Resultado esperado

- Los recordatorios de WhatsApp pasaran de `pending` (modo web manual) a `sent` (enviados automaticamente via API)
- Se dejara de ver el error "Unexpected token" en los logs
- Los recordatorios de manana se enviaran correctamente en la proxima ejecucion del cron (cada hora)
- Mandar las citas pendientes de mañana