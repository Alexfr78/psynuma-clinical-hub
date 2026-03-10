

## Diagnóstico

Hay dos bugs independientes al liquidar una deuda desde "Cobros y Deudas":

### Bug 1: La factura queda como "Emitida" en vez de "Pagada"
La función SQL `recompute_debt_by_invoice` actualiza correctamente el estado de la **deuda** a `paid`, pero **nunca actualiza** el campo `invoices.status`. Además, en `useCollectDebtPayment`, el paso 5 (`recompute_debt_by_invoice`) se ejecuta ANTES del paso 6 (emitir la factura draft→issued), por lo que cuando la factura finalmente se emite, nadie vuelve a verificar si ya está totalmente pagada.

### Bug 2: No se abre el diálogo de envío de factura
`RecordPaymentDialog` crea la factura y registra el pago, pero simplemente cierra el diálogo (`onOpenChange(false)`) sin notificar al componente padre (`Payments.tsx`) del `invoiceId` generado. `Payments.tsx` no importa ni usa `SendInvoiceDialog`.

---

## Plan de implementación

### 1. Migración SQL: `recompute_debt_by_invoice` sincronice `invoices.status`
Actualizar la función para que, tras recalcular la deuda, también actualice `invoices.status`:
- Si `v_paid_sum >= v_invoice_total` → `invoices.status = 'paid'`
- Si la factura estaba `paid` pero ahora `v_paid_sum < v_invoice_total` → `invoices.status = 'issued'`

### 2. Reordenar pasos en `useCollectDebtPayment`
Mover el paso 6 (emitir factura draft→issued) **antes** del paso 5 (`recompute_debt_by_invoice`), para que cuando se recalcule la deuda, la factura ya esté emitida y el RPC pueda marcarla como `paid` correctamente.

### 3. Abrir `SendInvoiceDialog` tras crear factura desde Cobros
- Modificar `RecordPaymentDialog` para que acepte un callback `onInvoiceCreated(invoiceId)` y lo llame cuando se genere una factura.
- En `Payments.tsx`, importar `SendInvoiceDialog`, añadir estado para el `invoiceId` generado, y abrir el diálogo automáticamente cuando `onInvoiceCreated` se dispare.

### Archivos afectados
- **Nueva migración SQL** — actualizar `recompute_debt_by_invoice`
- `src/hooks/useCollectDebtPayment.tsx` — reordenar issue antes de recompute
- `src/components/payments/RecordPaymentDialog.tsx` — añadir callback `onInvoiceCreated`
- `src/pages/Payments.tsx` — integrar `SendInvoiceDialog`

