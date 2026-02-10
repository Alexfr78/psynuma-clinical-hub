

# Fix: Notificacion WhatsApp no se envia al reservar desde el portal del paciente

## Problema
Al reservar cita desde el portal del paciente, solo llega el email pero no el WhatsApp, a pesar de tener Wasender conectado y el toggle `wasender_confirm_booking` activado.

## Causa raiz
En el archivo `supabase/functions/_shared/bookingPatientNotifications.ts`, la logica de seleccion de canal tiene un bloqueo incorrecto:

```
if (center.whatsapp_send_method !== 'web') {
  // Solo aqui se comprueba Wasender...
}
```

Tu centro tiene `whatsapp_send_method = 'web'` (porque no usas la API de Meta), asi que el sistema salta completamente la comprobacion de Wasender. El resultado es que `canAutoWhatsApp` queda en `false` y el sistema hace fallback a email.

El problema es que `'web'` se refiere al metodo manual (enlaces wa.me), pero Wasender es un canal automatico independiente que deberia funcionar sin importar ese ajuste.

## Solucion

### Archivo: `supabase/functions/_shared/bookingPatientNotifications.ts`

Separar la comprobacion de Wasender del bloqueo por `whatsapp_send_method`. Wasender siempre debe evaluarse si esta habilitado y conectado. Solo la comprobacion de Meta API debe respetar el filtro `whatsapp_send_method`.

Logica actualizada:

1. Comprobar Wasender siempre (si `wasender_enabled` y no `wasender_emergency_stop` y sesion conectada)
2. Comprobar Meta API solo si `whatsapp_send_method` NO es `'web'`

### Cambio concreto

```
// ANTES (bloquea todo si method es 'web')
if (center.whatsapp_send_method !== 'web') {
  // Check Wasender
  if (center.wasender_enabled && !center.wasender_emergency_stop) { ... }
  // Check Meta API
  if (!canAutoWhatsApp && center.whatsapp_send_method === 'api' && ...) { ... }
}

// DESPUES (Wasender se evalua siempre, Meta API respeta el filtro)
// Check Wasender (independent of whatsapp_send_method)
if (center.wasender_enabled && !center.wasender_emergency_stop) {
  const { data: wasenderSession } = await supabase
    .from("whatsapp_sessions")
    .select("status")
    .eq("center_id", centerId)
    .maybeSingle();

  if (wasenderSession?.status === 'connected') {
    canAutoWhatsApp = true;
  }
}

// Check Meta API (only if not 'web' and Wasender didn't work)
if (!canAutoWhatsApp && center.whatsapp_send_method === 'api' &&
    center.whatsapp_access_token && center.whatsapp_phone_number_id) {
  canAutoWhatsApp = true;
}
```

### Despliegue
- Redesplegar `patient-portal-sessions` (que importa este helper compartido)
- Tambien redesplegar cualquier otra funcion que use este helper: `public-booking`, `public-session-reschedule`

## Impacto
- Corrige el envio automatico de WhatsApp via Wasender al reservar desde el portal
- No afecta centros que usen Meta API (ya funcionaban)
- No afecta centros sin Wasender (seguiran usando email como fallback)

