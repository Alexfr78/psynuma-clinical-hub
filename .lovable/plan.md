

## Fix: Envio automatico de factura por WhatsApp (WasenderAPI)

### Problema

Cuando se genera una factura desde el detalle de sesion, el sistema intenta enviarla por WhatsApp pero termina mostrando el boton "Abrir WhatsApp" (modo manual) en lugar de enviarla automaticamente via WasenderAPI.

### Causa raiz

La funcion `send-invoice-notification` invoca `wasender-send-message` usando `supabase.functions.invoke()`. Sin embargo, `wasender-send-message` requiere autenticacion de usuario (valida el JWT contra `auth.getUser()`). Cuando se llama desde otra edge function de servidor, no hay un JWT de usuario valido, por lo que la llamada falla con "Unauthorized" y el sistema cae al fallback de modo "web" (enlace manual).

### Solucion

Modificar `send-invoice-notification` para que en lugar de invocar la edge function `wasender-send-message`, realice directamente la llamada HTTP a la API de WasenderAPI con la API Key. Esto sigue el patron ya documentado: las edge functions de servidor deben usar `fetch` directo para evitar restricciones de JWT.

### Cambios en `supabase/functions/send-invoice-notification/index.ts`

Reemplazar la funcion `sendWhatsAppViaWasender` que actualmente hace:

```typescript
// ACTUAL (falla porque wasender-send-message requiere JWT de usuario)
const { data, error } = await supabase.functions.invoke('wasender-send-message', {
  body: { phone, message, patient_id: patientId, message_type: 'invoice' },
});
```

Por una implementacion que llame directamente a la API de WasenderAPI:

```typescript
// NUEVO: fetch directo a WasenderAPI con API Key
async function sendWhatsAppViaWasender(
  supabase, centerId, phone, message, patientId
) {
  const wasenderApiKey = Deno.env.get('WASENDER_API_KEY');
  if (!wasenderApiKey) return { success: false, error: 'API Key missing' };

  // Obtener session ID del centro
  const { data: session } = await supabase
    .from('whatsapp_sessions')
    .select('wasender_session_id')
    .eq('center_id', centerId)
    .eq('status', 'connected')
    .maybeSingle();

  if (!session?.wasender_session_id) return { success: false, error: 'No session' };

  // Normalizar telefono
  let normalized = phone.replace(/[\s\-()]/g, '');
  if (!normalized.startsWith('+')) normalized = '+' + normalized;

  // Llamada directa a WasenderAPI
  const response = await fetch('https://www.wasenderapi.com/api/send-message', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${wasenderApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: session.wasender_session_id,
      to: normalized,
      text: message,
    }),
  });

  // Registrar mensaje en whatsapp_messages
  // ... (insertar registro para trazabilidad)

  return { success: response.ok };
}
```

### Archivos a modificar

- `supabase/functions/send-invoice-notification/index.ts` - Reescribir `sendWhatsAppViaWasender` para usar fetch directo con API Key en lugar de `supabase.functions.invoke`

