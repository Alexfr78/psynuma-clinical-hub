
## Fix: Mostrar dialogo de envio de factura tras cobrar sesion

### Problema
Cuando el usuario cobra una sesion desde el detalle y genera la factura (flujo del `CollectSessionPaymentDialog`), el sistema intenta enviar la factura silenciosamente con `sendNotification: true`, pero no muestra el dialogo `SendInvoiceDialog` para que el usuario elija como enviarla. En cambio, cuando se genera la factura por separado desde `CreateSessionInvoiceDialog`, si se muestra correctamente el dialogo de envio.

### Causa raiz
El `CollectSessionPaymentDialog` maneja el envio de factura internamente (auto-send silencioso), pero no abre el `SendInvoiceDialog` al finalizar. Si el auto-send falla o cae en modo web, el usuario solo ve un boton "Abrir WhatsApp" en el paso 'complete', en lugar de ser preguntado correctamente.

### Solucion
Modificar el flujo del `CollectSessionPaymentDialog` para que, tras crear la factura exitosamente, abra el `SendInvoiceDialog` (igual que hace `CreateSessionInvoiceDialog`). Esto requiere:

1. Que `CollectSessionPaymentDialog` devuelva la informacion de la factura creada via su callback `onSuccess`
2. Que `SessionDetailDrawer` capture esa info y abra el `SendInvoiceDialog`

### Cambios

#### 1. `src/components/agenda/CollectSessionPaymentDialog.tsx`
- En `createInvoiceForSession`, quitar `sendNotification: true` (ya no enviaremos silenciosamente)
- En el paso 'complete', cuando hay una factura creada, en lugar de mostrar el boton "Abrir WhatsApp", cerrar el dialogo y pasar la factura creada al callback `onSuccess`
- Cambiar la interfaz del callback `onSuccess` para que pueda recibir datos de la factura creada

#### 2. `src/components/agenda/SessionDetailDrawer.tsx`
- Actualizar el handler de `onSuccess` del `CollectSessionPaymentDialog` para que, si recibe datos de factura, abra el `SendInvoiceDialog` con esos datos (igual que hace con `CreateSessionInvoiceDialog`)

### Detalle tecnico

En `CollectSessionPaymentDialog`:
- Cambiar `onSuccess?: () => void` a `onSuccess?: (invoiceData?: { id: string; invoice_number: string; total: number }) => void`
- En `createInvoiceForSession`, pasar `sendNotification: false`
- En el paso 'complete', al hacer click en "Cerrar", llamar `onSuccess` con los datos de la factura si se creo una

En `SessionDetailDrawer`:
- Actualizar el `onSuccess` del `CollectSessionPaymentDialog` para capturar la factura y abrir `SendInvoiceDialog`:

```typescript
onSuccess={(invoiceData) => {
  refetchPaymentStatus();
  if (invoiceData && session.patient) {
    setCreatedInvoiceForSend({
      id: invoiceData.id,
      invoice_number: invoiceData.invoice_number,
      total: invoiceData.total,
      patients: {
        id: session.patient.id,
        first_name: session.patient.first_name,
        last_name: session.patient.last_name,
        email: session.patient.email,
        phone: session.patient.phone,
      },
    });
    setShowSendInvoiceDialog(true);
  }
}}
```

### Archivos a modificar
- `src/components/agenda/CollectSessionPaymentDialog.tsx`
- `src/components/agenda/SessionDetailDrawer.tsx`
