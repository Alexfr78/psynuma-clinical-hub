

## Corregir el envio de facturas al cobrar sesion

### Problema
Al cobrar una sesion desde el detalle de cita, la factura se genera correctamente pero la notificacion (WhatsApp/email segun configuracion) nunca se envia. El edge function `send-invoice-notification` no recibe ninguna llamada.

### Causa raiz
En `useCreateSignedInvoice.tsx`, el paso de envio de notificacion (linea 334) utiliza `sendNotification.mutateAsync()` — una mutacion de React Query anidada dentro de otra mutacion (`createSignedInvoice.mutateAsync`). Las mutaciones anidadas en React Query pueden fallar silenciosamente porque el estado interno del hook de la mutacion exterior interfiere con la ejecucion de la interior.

El `catch` en la linea 344 captura el error silenciosamente sin mostrarlo al usuario, haciendo invisible el fallo.

### Solucion
Reemplazar la llamada a `sendNotification.mutateAsync()` dentro de la mutacion por una llamada directa a `supabase.functions.invoke('send-invoice-notification', ...)`. Esto elimina la dependencia de la mutacion anidada y asegura que la notificacion se envie siempre.

### Cambios

#### `src/hooks/useCreateSignedInvoice.tsx`

1. Eliminar la importacion y uso de `useSendInvoiceNotification`
2. En el paso 8 (envio de notificacion), reemplazar `sendNotification.mutateAsync(...)` por una llamada directa:

```typescript
const { data: notificationData, error: notifError } = await supabase.functions.invoke(
  'send-invoice-notification',
  {
    body: {
      invoiceId: invoice.id,
      patientId,
      patientEmail,
      patientPhone,
      channel: sendChannel,
    },
  }
);

if (notifError) {
  console.error('Error sending notification:', notifError);
} else {
  result.notificationSent = true;
  result.whatsappLink = notificationData?.whatsappLink || null;
}
```

3. Mejorar el log de error para que sea visible en consola con el detalle completo

#### Archivos a modificar
- `src/hooks/useCreateSignedInvoice.tsx` - Unico archivo afectado

