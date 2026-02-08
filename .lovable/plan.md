
# Plan: Sistema Unificado de Envío de Mensajes con Priorización WasenderAPI

## Resumen del Problema

Actualmente el sistema tiene dos vías de WhatsApp separadas:
1. **Meta Business API** (`whatsapp_send_method: 'api'`) - En la configuración antigua
2. **WasenderAPI** (`wasender_enabled: true`) - Sistema nuevo con QR

Cuando creas una sesión y marcas "notificar por WhatsApp", el sistema muestra un diálogo con opciones manuales (enlaces web) en lugar de enviar automáticamente por WasenderAPI. El usuario tiene que elegir entre varias opciones confusas.

## Flujo Propuesto

```text
┌─────────────────────────────────────────────────────────────────┐
│                    CREAR SESIÓN                                 │
│    [x] Notificar por WhatsApp  [x] Notificar por Email          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 ¿WasenderAPI conectado?                         │
│     (wasender_enabled=true Y session.status='connected')        │
└─────────────────────────────────────────────────────────────────┘
         │                                      │
        SÍ                                     NO
         │                                      │
         ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────────────┐
│  ENVÍO AUTOMÁTICO   │              │    FALLBACK: Enlace manual  │
│  via WasenderAPI    │              │    (Abrir WhatsApp/Web)      │
│  Sin diálogo extra  │              │    Mostrar diálogo simple    │
│  Toast: "Enviado"   │              └─────────────────────────────┘
└─────────────────────┘
```

## Cambios Técnicos

### 1. Nuevo Hook: `useWhatsAppDelivery`
Crear un hook centralizado que determine el mejor método de envío:

- **Prioridad 1**: WasenderAPI si está habilitado Y conectado
- **Prioridad 2**: Meta API si está configurado (`whatsapp_send_method: 'api'`)
- **Prioridad 3**: Enlaces manuales (web/universal) como fallback

El hook expone:
- `deliveryMethod`: `'wasender' | 'meta_api' | 'manual'`
- `isAutomatic`: `true` si puede enviar sin intervención del usuario
- `isConnected`: estado de conexión de WasenderAPI
- `sendViaWasender()`: función para enviar directamente
- `getManualLink()`: genera enlace wa.me para fallback

### 2. Modificar `useSendSessionNotification`
Actualizar el hook existente para:

1. Primero verificar si WasenderAPI está habilitado Y conectado
2. Si lo está → enviar directamente via `wasender-send-message` edge function
3. Si no → verificar Meta API (`whatsapp_send_method: 'api'`)
4. Si ninguno → devolver datos para diálogo manual

### 3. Simplificar `WhatsAppLinkDialog`
Cambiar el diálogo a un formato más simple:

- **Si el envío fue automático**: No mostrar diálogo (solo toast de confirmación)
- **Si requiere acción manual**: Mostrar diálogo simplificado con:
  - Un botón principal "Enviar por WhatsApp"
  - Vista previa del mensaje
  - Opción de copiar enlace

### 4. Actualizar UI en `SessionNotificationSettings`
Mostrar el método activo de forma clara:

- Badge que indique: "WasenderAPI (Auto)" vs "Enlace manual"
- Si WasenderAPI está habilitado pero desconectado → mostrar advertencia

### 5. Modificar `QuickCreateSessionDialog` y `CreateSessionDialog`
Actualizar la lógica post-creación:

1. Si el envío fue automático → solo mostrar toast de éxito
2. Si requiere intervención manual → mostrar el diálogo simplificado

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useWhatsAppDelivery.tsx` | **NUEVO** - Hook centralizado para determinar método de envío |
| `src/hooks/useSendSessionNotification.tsx` | Integrar lógica de priorización WasenderAPI |
| `src/components/agenda/WhatsAppLinkDialog.tsx` | Simplificar a diálogo de fallback únicamente |
| `src/components/agenda/QuickCreateSessionDialog.tsx` | Usar nueva lógica, omitir diálogo si envío automático |
| `src/components/agenda/CreateSessionDialog.tsx` | Mismo cambio que QuickCreateSessionDialog |
| `src/components/agenda/SessionNotificationSettings.tsx` | Mostrar método activo con badge más claro |

## Detalles de Implementación

### Hook `useWhatsAppDelivery`
```typescript
export function useWhatsAppDelivery() {
  const { center } = useCenter();
  const { session, isConnected } = useWasender();
  
  // Determinar método de envío
  const deliveryMethod = useMemo(() => {
    // Prioridad 1: WasenderAPI
    if (center?.wasender_enabled && isConnected) {
      return 'wasender';
    }
    // Prioridad 2: Meta API
    if (center?.whatsapp_send_method === 'api') {
      return 'meta_api';
    }
    // Fallback: Enlaces manuales
    return 'manual';
  }, [center, isConnected]);
  
  return {
    deliveryMethod,
    isAutomatic: deliveryMethod !== 'manual',
    isWasenderAvailable: center?.wasender_enabled && isConnected,
    // ...
  };
}
```

### Flujo en `useSendSessionNotification`
```typescript
// En handleWhatsApp:
if (center?.wasender_enabled) {
  // Verificar estado de conexión
  const { data: wasenderSession } = await supabase
    .from('whatsapp_sessions')
    .select('status')
    .eq('center_id', centerId)
    .single();
    
  if (wasenderSession?.status === 'connected') {
    // Enviar via WasenderAPI
    await supabase.functions.invoke('wasender-send-message', {
      body: { phone, message, patient_id, session_id }
    });
    return { autoSent: true };
  }
}

// Fallback a lógica actual (web/api)
```

## Experiencia de Usuario Final

1. **Usuario crea sesión** → marca "Notificar por WhatsApp"
2. **Si WasenderAPI conectado**:
   - Mensaje se envía automáticamente
   - Toast: "✓ Notificación de WhatsApp enviada"
   - No aparece ningún diálogo adicional
3. **Si WasenderAPI no disponible**:
   - Aparece diálogo simple: "¿Enviar WhatsApp a [Paciente]?"
   - Botón único: "Abrir WhatsApp"
   - Se abre WhatsApp Web/App con mensaje prellenado

## Validación

- Si el paciente no tiene teléfono → mostrar advertencia y omitir WhatsApp
- Si WasenderAPI está habilitado pero desconectado → usar fallback manual con aviso
- Respetar `wasender_emergency_stop` para bloquear envíos automáticos
