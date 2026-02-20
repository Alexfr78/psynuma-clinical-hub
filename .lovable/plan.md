

## Fix: SendInvoiceDialog no aparece en movil tras cobrar sesion

### Problema detectado

Hay dos problemas que impiden que el dialogo de envio de factura aparezca en movil:

### 1. Conflicto de animacion Drawer/Dialog (problema principal)

En `handleComplete`, el codigo hace:
```
handleClose();          // cierra el Drawer (con animacion de ~300ms)
onSuccess?.(invoiceData); // intenta abrir SendInvoiceDialog inmediatamente
```

En movil, `CollectSessionPaymentDialog` usa un **Vaul Drawer**. Al llamar `handleClose()`, se inicia la animacion de cierre del Drawer, que mantiene su overlay (`bg-black/80`, `z-50`) activo durante la transicion. Inmediatamente despues, `onSuccess` dispara `setShowSendInvoiceDialog(true)` en el componente padre, pero el `SendInvoiceDialog` es un **Radix Dialog** que intenta renderizarse mientras el overlay del Drawer anterior aun esta visible y bloqueando interacciones.

### 2. SendInvoiceDialog no usa Drawer en movil

El componente `SendInvoiceDialog` siempre renderiza un `Dialog` de Radix, incluso en movil. Esto puede causar problemas de usabilidad y conflictos con otros Drawers activos.

### Solucion

#### Cambio 1: `CollectSessionPaymentDialog.tsx` - Invertir orden y diferir apertura

Cambiar `handleComplete` para que llame `onSuccess` **antes** de cerrar, y usar un `setTimeout` para dar tiempo a la animacion del Drawer:

```typescript
const handleComplete = () => {
  const invoiceData = createdInvoiceId && createdInvoiceNumber
    ? { id: createdInvoiceId, invoice_number: createdInvoiceNumber, total: createdInvoiceTotal }
    : undefined;
  // Primero cerramos el dialogo
  onOpenChange(false);
  // Diferimos el callback para que el Drawer termine su animacion
  setTimeout(() => {
    onSuccess?.(invoiceData);
    resetForm();
  }, 350);
};
```

Ademas, actualizar `handleClose` para que NO llame a `onSuccess`, solo cierre y resetee. Y actualizar el `onOpenChange` del Drawer para que al cerrar por swipe no pierda datos si hay factura pendiente.

#### Cambio 2: `SendInvoiceDialog.tsx` - Usar Drawer en movil

Modificar `SendInvoiceDialog` para que detecte si esta en movil con `useIsMobile()` y use un **Drawer** en lugar de un Dialog, siguiendo el mismo patron que `CollectSessionPaymentDialog`.

### Archivos a modificar

1. **`src/components/agenda/CollectSessionPaymentDialog.tsx`**
   - Reescribir `handleComplete` para diferir el callback con `setTimeout(350ms)` tras cerrar
   - Separar la logica de `handleClose` (cierre por cancelacion) de `handleComplete` (cierre exitoso)

2. **`src/components/invoices/SendInvoiceDialog.tsx`**
   - Importar `useIsMobile`, `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerFooter`
   - En movil, renderizar el contenido dentro de un Drawer en lugar de un Dialog
