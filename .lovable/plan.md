

## Plan: Añadir campo de notas a los formularios de factura

### Problema
Los diálogos de creación de facturas (`CreateSimpleInvoiceDialog` y `CreateSessionInvoiceDialog`) no incluyen un campo de "Observaciones/Notas". La tabla `invoices` ya tiene la columna `notes` y tanto la vista web (`InvoiceView.tsx`) como el PDF (`generate-invoice-pdf`) ya renderizan las notas si existen. Solo falta el input en los formularios de creación.

### Cambios

1. **`src/components/invoices/CreateSimpleInvoiceDialog.tsx`**
   - Añadir estado `const [notes, setNotes] = useState('')`
   - Añadir un `<Textarea>` con label "Observaciones" después de la sección de totales y antes del warning de datos faltantes
   - Incluir `notes: notes || null` en el objeto `invoice` dentro de `handleCreateInvoice`
   - Resetear `notes` al cerrar el diálogo

2. **`src/components/agenda/CreateSessionInvoiceDialog.tsx`**
   - Mismo patrón: añadir estado `notes`, campo `<Textarea>`, e incluirlo en el submit

3. **Sin cambios en backend** — la columna `notes` ya existe en la tabla `invoices`, y tanto `InvoiceView.tsx` como la edge function `generate-invoice-pdf` ya muestran las notas cuando están presentes.

