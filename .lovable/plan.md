# Anular la factura simplificada SP260056 de Alejandro Macías

## Situación comprobada

La sesión del 27 de agosto (18:00, 75 €) acabó con dos facturas por el mismo servicio:

- **SP260056** — simplificada, 75 €, emitida y registrada en AEAT. Es la que lleva asociado el cobro real de Stripe de ese día.
- **SF260112** — completa, 75 €, emitida y registrada en AEAT, por esa misma sesión. El cobro que tiene enlazado no es el de Stripe, sino un pago con tarjeta anterior que en realidad corresponde a otra sesión (la de las 16:00).

Las dos están ya selladas en AEAT, así que ninguna se puede borrar: la anulación tiene que enviarse a Hacienda como tal.

Además, las dos sesiones implicadas siguen marcadas internamente como "pendientes de facturar" aunque ya tienen factura, lo que es lo que provoca que se vuelvan a colar en los listados.

## Qué propongo hacer

1. **Anular SP260056 en AEAT** con el motivo "Emitida por error: el cliente solicita factura completa", usando la anulación oficial que ya existe en la pantalla de Facturas. SF260112 queda como la única factura válida de esa sesión.
2. **Recolocar el cobro para que no quede huérfano**: el pago de Stripe del 27 de agosto pasa a quedar enlazado a SF260112 (que es la factura de su misma sesión), y el pago con tarjeta anterior deja de estar enlazado a SF260112 y queda donde le corresponde, cubriendo la sesión de las 16:00. Ni el importe cobrado ni la deuda de Alejandro cambian: sigue todo saldado.
3. **Cerrar como facturadas** las dos sesiones que seguían marcadas como pendientes, para que no vuelvan a aparecer en cobros/facturación pendiente.
4. **Comprobación final**: repasar que Alejandro no queda con deudas pendientes, que SP260056 figura anulada y que SF260112 sigue como pagada.

No toco código de aplicación: es una corrección de datos más el envío de la anulación a AEAT.

## Detalle técnico

- Invocar `cancel-registro-facturacion` con `invoice_id = 0a914e23-5261-4926-91f3-2909f6f0a01b` y el motivo indicado; verificar el `verifactu_records` / `verifactu_events` resultante y que la cadena queda encadenada sin error.
- `payments`: `91774031…` (Stripe, sesión `e2b95f43`) → `invoice_id = 289f2fae…` (SF260112); `5a9caf60…` (tarjeta, sesión `d38021c8`) → `invoice_id = NULL`. Después recalcular con `recompute_debt_by_invoice` sobre las deudas afectadas para que los estados de factura/deuda se mantengan coherentes.
- `billable_events` `dbe6f3b8…` y `58221870…` → `billing_status = 'settled'`.
- Sin cambios de frontend ni de edge functions.
