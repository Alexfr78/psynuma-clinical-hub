
# Plan: Unificar Configuración de WhatsApp en Toda la Aplicación

## Problema Identificado

Actualmente existen **DOS secciones separadas** de configuración para WhatsApp:
- **WhatsApp Business** → Ofrece "WhatsApp Web" o "Meta API (Automático)"
- **WasenderAPI** → Sistema separado para automatizar con número personal

Esto genera confusión porque el usuario tiene que configurar dos sitios diferentes, y la aplicación no respeta de manera uniforme el método seleccionado.

### Lugares donde NO se respeta la configuración:

| Componente/Función | Problema |
|---|---|
| `SendConsentDialog.tsx` | Usa `window.open('whatsapp://...')` directamente, ignora toda configuración |
| `Consents.tsx` (handleOpenWhatsApp) | Usa `wa.me` directamente sin consultar configuración |
| `send-invoice-notification` (Edge Function) | Solo considera Meta API, no WasenderAPI |
| `send-notification` (Edge Function) | Solo considera Meta API, no WasenderAPI |
| `send-payment-reminder` (Edge Function) | Delega a `send-notification`, que no usa WasenderAPI |

## Solución Propuesta

### 1. Unificar las Secciones de Configuración de WhatsApp

Modificar `WhatsAppIntegrationSection.tsx` para incluir **tres opciones** de método de envío:

- **WhatsApp Web** (Manual) - Genera enlaces para enviar manualmente
- **WasenderAPI** (Automático con tu número) - Usa tu número personal
- **Meta API** (Automático empresarial) - Usa la API oficial de WhatsApp Business

Eliminar la sección separada de WasenderAPI del menú de Configuración, integrando toda la funcionalidad en una única sección.

### 2. Actualizar Componentes del Frontend

**Archivos a modificar:**

| Archivo | Cambio |
|---|---|
| `src/components/consents/SendConsentDialog.tsx` | Usar `useWhatsAppDelivery` hook en lugar de enlaces directos |
| `src/pages/Consents.tsx` | Usar `useWhatsAppDelivery` hook |
| `src/components/invoices/SendInvoiceDialog.tsx` | Verificar que usa correctamente el sistema centralizado |
| `src/components/payments/SendPaymentReminderDialog.tsx` | Verificar integración correcta |

### 3. Actualizar Edge Functions

**Funciones a modificar:**

| Función | Cambio |
|---|---|
| `send-notification/index.ts` | Agregar verificación de WasenderAPI como prioridad 1 antes de Meta API |
| `send-invoice-notification/index.ts` | Agregar soporte para WasenderAPI |
| `send-payment-reminder/index.ts` | Verificar que propaga correctamente el método |

### 4. Flujo de Prioridad Unificado

```text
┌─────────────────────────────────────────────────────────────┐
│            Enviar WhatsApp desde cualquier lugar            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │ ¿WasenderAPI habilitado Y    │
              │  conectado Y sin parada     │
              │  de emergencia?             │
              └──────────────────────────────┘
                   │                │
                  SÍ               NO
                   │                │
                   ▼                ▼
          ┌────────────┐   ┌──────────────────────────────┐
          │ Enviar vía │   │ ¿Meta API configurado       │
          │ WasenderAPI│   │  (whatsapp_send_method=api) │
          │ (automático)│  │  con token válido?          │
          └────────────┘   └──────────────────────────────┘
                                 │                │
                                SÍ               NO
                                 │                │
                                 ▼                ▼
                        ┌────────────┐   ┌────────────────┐
                        │ Enviar vía │   │ Generar enlace │
                        │ Meta API   │   │ manual         │
                        │ (automático)│  │ (WhatsAppLink- │
                        └────────────┘   │ Dialog)        │
                                         └────────────────┘
```

---

## Detalles Técnicos

### Cambios en WhatsAppIntegrationSection.tsx

```typescript
// Nuevo tipo de método de envío con 3 opciones
type WhatsAppSendMethod = 'web' | 'wasender' | 'api';

// Radio buttons actualizados:
// - "WhatsApp Web" (value="web") - Manual
// - "WasenderAPI" (value="wasender") - Automático con tu número
// - "Meta API" (value="api") - Automático empresarial
```

Cuando se selecciona "wasender":
- Mostrar panel de conexión QR (mover desde WasenderIntegrationSection)
- Mostrar estado de conexión
- Mostrar opciones de automatización (24h, 2h, confirmación, cancelación)

### Cambios en send-notification Edge Function

```typescript
// NUEVO: Verificar WasenderAPI primero
const { data: wasenderConfig } = await supabase
  .from("centers")
  .select("wasender_enabled, wasender_emergency_stop")
  .eq("id", notification.center_id)
  .single();

const { data: wasenderSession } = await supabase
  .from("whatsapp_sessions")
  .select("status")
  .eq("center_id", notification.center_id)
  .maybeSingle();

if (wasenderConfig?.wasender_enabled && 
    !wasenderConfig?.wasender_emergency_stop && 
    wasenderSession?.status === 'connected') {
  // Enviar via wasender-send-message
  const { data, error } = await supabase.functions.invoke('wasender-send-message', {
    body: { phone, message }
  });
  if (!error && data?.success) {
    success = true;
    // No generar whatsappWebLink
  }
} else if (sendMethod === 'api') {
  // Código existente para Meta API
} else {
  // Código existente para modo web (enlace manual)
}
```

### Cambios en SendConsentDialog.tsx

```typescript
// ANTES (problema):
const handleWhatsAppApp = () => {
  window.open(`whatsapp://send?text=${encodedMessage}`, '_blank');
};

// DESPUÉS (solución):
const { sendWhatsApp, deliveryMethod } = useWhatsAppDelivery();
const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);

const handleSendWhatsApp = async () => {
  if (!patientPhone) {
    toast.error('El paciente no tiene teléfono');
    return;
  }
  
  const result = await sendWhatsApp({
    phone: patientPhone,
    message,
    patientId: consent.patient_id,
    patientName: consent.patient?.first_name || '',
    centerId: center.id,
  });
  
  if (result.manualLink) {
    setWhatsAppDialogData({ ... });
    setShowWhatsAppDialog(true);
  }
};
```

---

## Archivos a Modificar

| Archivo | Tipo de cambio |
|---|---|
| `src/components/settings/integrations/WhatsAppIntegrationSection.tsx` | Agregar tercera opción "WasenderAPI" e integrar panel de conexión QR |
| `src/pages/Settings.tsx` | Eliminar sección separada de WasenderAPI del menú |
| `src/components/consents/SendConsentDialog.tsx` | Usar hook `useWhatsAppDelivery` |
| `src/pages/Consents.tsx` | Usar hook `useWhatsAppDelivery` |
| `supabase/functions/send-notification/index.ts` | Agregar prioridad a WasenderAPI |
| `supabase/functions/send-invoice-notification/index.ts` | Agregar soporte WasenderAPI |

---

## Resultado Esperado

1. **Una sola sección** en Configuración → Conexiones Externas → WhatsApp Business
2. **Tres opciones claras** de método de envío
3. **Toda la aplicación** respetará el método seleccionado
4. **Sin duplicación** de código de WhatsApp en diferentes componentes
5. **WasenderAPI como prioridad 1** cuando esté configurado y conectado

