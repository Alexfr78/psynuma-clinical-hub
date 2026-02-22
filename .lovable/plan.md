

## Correccion: Envio automatico de WhatsApp desde detalle de cita

### Diagnostico

El boton "WhatsApp" en la seccion "Enviar ahora" del detalle de cita usa el hook `useWhatsAppDelivery`, que depende del estado cacheado de `useWasender`. Tras desconectar y reconectar WhatsApp, el estado cacheado puede quedar desactualizado (`disconnected`), lo que hace que el sistema considere que no hay envio automatico disponible y caiga al modo manual (abriendo la app de WhatsApp).

En contraste, la funcion `sendSessionNotificationDirect` (usada al crear citas) consulta directamente la base de datos para verificar el estado de WasenderAPI, y por eso funciona correctamente.

### Causa raiz

El boton de envio en el detalle de cita depende de:
1. `useWhatsAppDelivery().deliveryMethod` -- usa datos cacheados del hook `useWasender`
2. Si `deliveryMethod !== 'wasender'`, cae al modo manual

Cuando el cache de `useWasender` tiene datos desactualizados (por ejemplo, tras reconectar), el metodo se evalua como `'manual'` en lugar de `'wasender'`.

### Solucion

Modificar el flujo de envio de WhatsApp en el detalle de cita para que, al igual que `sendSessionNotificationDirect`, consulte directamente la base de datos antes de decidir el metodo de envio, en lugar de depender exclusivamente del cache del hook.

### Cambios tecnicos

**Archivo: `src/components/agenda/SessionDetailDrawer.tsx`**

Modificar el `onClick` del boton "WhatsApp" (lineas ~1553-1612) para:

1. Antes de llamar a `whatsappDelivery.sendWhatsApp()`, verificar directamente en la BD:
   - Consultar `whatsapp_sessions` para comprobar si `status === 'connected'`
   - Si esta conectado, llamar directamente a `wasender-send-message` via `supabase.functions.invoke`
   - Solo caer al modo manual si la llamada a WasenderAPI falla

2. Reutilizar la logica ya probada de `sendSessionNotificationDirect` adaptandola al contexto del boton

**Alternativa mas limpia**: Modificar la funcion `sendWhatsApp` del hook `useWhatsAppDelivery` para que siempre verifique el estado actual de la BD antes de decidir el metodo, anadiendo una consulta directa a `whatsapp_sessions` dentro de la funcion `sendWhatsApp` en lugar de depender del memo `deliveryMethod`.

**Archivo: `src/hooks/useWhatsAppDelivery.tsx`**

Cambiar la funcion `sendWhatsApp` (linea ~155) para:

```
// En lugar de usar el deliveryMethod cacheado:
// if (deliveryMethod === 'wasender') { ... }

// Verificar directamente en la BD:
const { data: liveSession } = await supabase
  .from('whatsapp_sessions')
  .select('status, wasender_session_id')
  .eq('center_id', params.centerId)
  .maybeSingle();

const isLiveConnected = liveSession?.status === 'connected' 
  && center?.wasender_enabled 
  && !center?.wasender_emergency_stop;

if (isLiveConnected) {
  // Enviar via WasenderAPI
  const result = await sendViaWasender({ ... });
  if (result.autoSent) { ... }
}
```

Esto asegura que la decision de envio se basa en el estado real de la BD en el momento del click, no en datos cacheados que pueden estar desactualizados.

### Resultado esperado

- El boton "WhatsApp" en el detalle de cita enviara automaticamente via WasenderAPI cuando la sesion esta conectada
- No se abrira la app de WhatsApp manualmente si WasenderAPI esta disponible
- El comportamiento sera consistente con el envio durante la creacion de citas
