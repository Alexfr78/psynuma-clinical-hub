# Facturas de Gonzalo de Porras que siguen apareciendo como pendientes

## Qué pasa (comprobado en los datos)

Tres facturas de Gonzalo de Porras están cobradas al 100% pero siguen marcadas como "Emitida" (pendiente):

| Factura | Importe | Cobro registrado | Estado actual |
|---|---|---|---|
| SF260111 | 75,00 € | 18/09/2026, tarjeta online | Emitida |
| SF260114 | 65,00 € | 13/09/2026, tarjeta online | Emitida |
| SF260116 | 65,00 € | 18/09/2026, tarjeta online | Emitida |

En las tres, el cobro existe y la deuda asociada figura como pagada (importe pendiente 0). Solo la ficha de la factura se quedó atrás, así que en el listado se ven como pendientes.

Aparte, queda un cobro realmente pendiente de 65,00 € de una sesión del 08/05/2026 que nunca se facturó. Ese no es un error: está pendiente de verdad.

## Qué haré

1. Poner las tres facturas (SF260111, SF260114, SF260116) como "Pagada", con la fecha del cobro ya registrado. No se modifica ningún dato fiscal ni el sello de VeriFactu: solo el estado de cobro.
2. Revisar por qué el pago online no actualizó el estado de la factura y corregirlo, para que no vuelva a pasar con futuros cobros con tarjeta.
3. Repasar si hay más facturas del centro en la misma situación (cobradas pero marcadas como emitidas) y dejarlas coherentes.
4. Comprobar en la pantalla de Facturas que las tres aparecen ya como pagadas y que el saldo pendiente del contacto solo muestra los 65 € de la sesión sin facturar.

## Detalle técnico

- Origen: los pagos llegan con `notes` de pago online (Stripe) y sí crean `payments` + actualizan `debts` a `paid`, pero `invoices.status` se queda en `issued`. Hay que revisar la ruta de recomputo tras el pago (`recompute_debt_by_invoice` / `stripe-webhook` / `create-debt-payment-checkout`) para confirmar dónde se pierde la actualización del estado de la factura.
- Corrección de datos: `UPDATE invoices SET status='paid'` solo para las facturas con `is_valid = true` cuya suma de `payments.status='paid'` cubre el total y cuya deuda está en `paid`. Sin tocar `verifactu_records` ni importes.
- Barrido general: consulta de reconciliación por centro para detectar el mismo desajuste en otras facturas antes de aplicar el arreglo.
