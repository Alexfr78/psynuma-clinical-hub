

## Corrección: Normalización de teléfonos en wasender-send-message

### Diagnóstico

Los mensajes de WhatsApp enviados via WasenderAPI aparecen como "Esperando mensaje" porque se envían con números de teléfono incorrectos. Por ejemplo, el mensaje a Iker se envió a `+680348650` en lugar de `+34680348650`.

### Causa raíz

La función `wasender-send-message` no normaliza los números españoles de 9 dígitos. Solo elimina espacios y guiones, y añade un `+` si no lo tiene. En contraste, la función `send-session-reminders` sí tiene la lógica correcta:

```text
send-session-reminders (correcto):
  cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
    cleanPhone = '34' + cleanPhone;
  }

wasender-send-message (incorrecto):
  normalized = trimmedPhone.replace(/[\s\-()]/g, "");
  to = normalized.startsWith("+") ? normalized : `+${normalized}`;
  // No añade prefijo 34 para números de 9 dígitos
```

Esto causa que números como `680348650` o `+680348650` se envíen sin el código de país, y WhatsApp no puede entregarlos correctamente.

### Solución

Actualizar la normalización de teléfonos en `wasender-send-message` para detectar y añadir el prefijo `34` a números españoles de 9 dígitos, usando la misma lógica que ya funciona en `send-session-reminders`.

### Cambios técnicos

**Archivo: `supabase/functions/wasender-send-message/index.ts`**

Reemplazar la lógica de normalización (líneas 111-121) por:

```typescript
// Normalize phone: strip non-digits, add Spanish country code if needed
let cleanPhone = trimmedPhone.replace(/\D/g, '');

// Add Spanish country code for 9-digit numbers starting with 6 or 7
if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
  cleanPhone = '34' + cleanPhone;
}

const to = isJid ? normalized : `+${cleanPhone}`;
```

Esto transforma:
- `680348650` a `+34680348650` (correcto)
- `+680348650` a `+34680348650` (correcto)
- `+34680348650` a `+34680348650` (sin cambio)
- `34680348650` a `+34680348650` (sin cambio)

### Resultado esperado

- Los mensajes de WhatsApp se enviarán con el número correcto incluyendo el prefijo de país
- Los mensajes se entregarán inmediatamente en lugar de quedar en estado "Esperando mensaje"
- El comportamiento será consistente entre `wasender-send-message` y `send-session-reminders`
