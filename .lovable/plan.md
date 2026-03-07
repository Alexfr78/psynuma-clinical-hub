

## Problema

Los pagos vinculados a facturas muestran un candado y no permiten editar ni eliminar. Esto impide deshacer cobros incorrectos.

La lógica backend ya existe (`delete_payment_and_recompute_debt_v2` y `update_payment_and_recompute_debt_v2`) para manejar correctamente la eliminación/edición recomputando la deuda. Solo falta desbloquear la UI.

## Solución

### Archivo: `src/components/payments/PaymentHistoryTable.tsx`

- Eliminar la condición `canEdit = !hasInvoice` que bloquea las acciones
- Permitir siempre editar y eliminar pagos, independientemente de si están vinculados a factura
- Mantener el botón "Vincular a factura" solo cuando NO tiene factura (eso sigue teniendo sentido)
- Mostrar el badge de factura como info, no como bloqueo

### Archivo: `src/pages/Payments.tsx`

- Actualizar el texto del diálogo de confirmación de eliminación para mencionar que se recomputará la deuda asociada si hay factura vinculada

No se necesitan cambios en hooks ni migraciones — la lógica backend ya soporta ambas operaciones.

