

## Problema

Cuando se genera una factura desde una cita usando el diálogo de facturación de sesión (`CreateSessionInvoiceDialog`), se usa el hook `useCreateInvoiceWithSeries`. Este hook crea la factura con status `issued` pero **no genera un registro de deuda** en la tabla `debts`.

La corrección anterior solo añadió la auto-creación de deuda en `useIssueInvoice` y `useCreateSignedInvoice`, pero no en `useCreateInvoiceWithSeries`, que es el flujo principal para facturar desde la agenda.

## Solución

### Archivo: `src/hooks/useInvoices.tsx` — `useCreateInvoiceWithSeries`

Tras crear la factura con status `issued` (no draft), insertar automáticamente un registro en `debts` con:
- `invoice_id` = id de la factura creada
- `patient_id` = paciente de la factura
- `center_id` = centro
- `amount` = total de la factura
- `paid_amount` = 0
- `status` = 'pending'
- `due_date` = fecha actual
- `session_id` = session_id del primer item (si existe)

Solo se crea la deuda si el status NO es `draft`.

### Archivo: `src/components/invoices/CreateSimpleInvoiceDialog.tsx`

Verificar si este diálogo también usa `useCreateInvoiceWithSeries` con status `issued` — si es así, la corrección en el hook cubrirá ambos flujos automáticamente.

No se necesitan migraciones de base de datos.

