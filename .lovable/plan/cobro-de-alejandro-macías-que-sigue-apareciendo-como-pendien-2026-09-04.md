# Cobro de Alejandro Macías que sigue apareciendo como pendiente

## Qué he comprobado

La sesión del 3 de septiembre (75 €) sí está cobrada: el pago por Stripe está registrado y la deuda figura como saldada. Lo que no cuadra es la factura **SF260113**: tiene el pago completo asociado pero se quedó en estado "emitida" en lugar de "pagada", y por eso el sistema la sigue mostrando como cobro pendiente.

Además, esa misma sesión sigue marcada internamente como "pendiente de facturar", igual que ocurrió el 27 de agosto, cuando se acabaron generando dos facturas para la misma sesión (SF260112 y SP260056). Es el mismo patrón, así que conviene cerrarlo en el mismo paso.

## Qué propongo hacer

1. Corregir el dato actual: marcar SF260113 como pagada y cerrar la sesión del 3 de septiembre como ya facturada, para que desaparezca de cobros pendientes.
2. Revisar si hay más facturas en la misma situación (pago completo registrado pero estado "emitida") y corregirlas todas de una vez.
3. Arreglar el origen: cuando un pago llega por Stripe y se asocia a una factura ya existente, el sistema debe actualizar también el estado de la factura y cerrar la sesión como facturada, no solo la deuda.
4. Dejar la factura duplicada del 27 de agosto anotada para que decidas cuál anular (no la toco sin tu visto bueno).

## Detalle técnico

- Migración puntual de datos: recalcular estado de `invoices` con `paid >= total` y `status = 'issued'` (vía `recompute_debt_by_invoice` sobre las deudas afectadas), y poner `billable_events.billing_status = 'settled'` para la sesión `a8bd1003`.
- En `stripe-webhook` (rama de pago sobre deuda/factura existente, no la de `createInvoice.ts`): tras insertar el pago, invocar el recálculo de estado de la factura y marcar el `billable_event` de la sesión como `settled`, replicando lo que ya hace `createInvoice.ts`.
- Sin cambios de frontend.
