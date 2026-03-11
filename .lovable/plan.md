

## Problema

Cuando se paga una deuda desde "Cobros y Deudas", la sesión asociada permanece en estado `scheduled`/`confirmed` en lugar de pasar a `completed`. El cron diario (08:00 UTC) solo actúa sobre sesiones pasadas sin deudas pendientes, pero si el pago ocurre después de esa hora, la sesión queda sin completar hasta el día siguiente.

## Solución

Actualizar la sesión a `completed` de forma inmediata cuando se liquida completamente la deuda.

### Cambio 1: Actualizar `recompute_debt_by_invoice` (SQL)

Añadir al final de la función, después de sincronizar `invoices.status`, una comprobación:
- Si `v_new_status = 'paid'` y la deuda tiene un `session_id`, actualizar `sessions.status = 'completed'` (solo si el estado actual es `scheduled` o `confirmed` y `session_date < CURRENT_DATE`).

### Cambio 2: Actualizar `useCollectDebtPayment.tsx`

En el branch `else` (sin factura), cuando `newStatus = 'paid'` y `debt.session_id` existe, actualizar también `sessions.status = 'completed'` si la sesión es pasada.

### Archivos afectados
- **Nueva migración SQL** — actualizar `recompute_debt_by_invoice`
- `src/hooks/useCollectDebtPayment.tsx` — completar sesión en el branch sin factura

