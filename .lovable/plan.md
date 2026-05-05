## Problema

En la ficha de sesión (Drawer) se muestra el precio actualizado (p. ej. **1,00€**), pero al pulsar **"Cobrar sesión"** el diálogo abre con el importe antiguo (**75,00€**, ver captura). El cobro se registra por el importe equivocado.

## Causa raíz

`CollectSessionPaymentDialog` recibe `amount={paymentStatus?.isCollectable ? paymentStatus.remainingAmount : localPrice}` (`SessionDetailDrawer.tsx`, línea 2329).

`paymentStatus` viene del hook `useSessionPaymentStatus` con queryKey `['session-payment-status', sessionId]`.

Cuando se edita el precio (`handlePriceSave` → `useUpdateSession`), el hook actualiza la deuda en BD pero en `onSuccess` solo invalida:
- `['sessions']`
- `['debts']`
- `['billable-events']`

**Nunca invalida `['session-payment-status']`**, así que `remainingAmount` queda cacheado con el valor antiguo (75€). Al cobrar, la RPC `collect_session_payment_v2` recibe ese importe stale; si la nueva deuda lo permite (p. ej. era mayor) registra un cobro incorrecto, y si no, lo rechaza silenciosamente.

## Solución

Añadir la invalidación de `session-payment-status` (y `session-invoice-status` por consistencia) en el `onSuccess` de `useUpdateSession`, para que cualquier cambio de precio refresque el importe pendiente que ve el diálogo de cobro.

### Cambio único

**`src/hooks/useSessions.tsx`** (~línea 160)

```typescript
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['sessions'] });
  queryClient.invalidateQueries({ queryKey: ['debts'] });
  queryClient.invalidateQueries({ queryKey: ['billable-events'] });
  queryClient.invalidateQueries({ queryKey: ['session-payment-status'] });
  queryClient.invalidateQueries({ queryKey: ['session-invoice-status'] });
},
```

## Resultado

Tras editar el precio, el botón "Cobrar pendiente" y el diálogo "Cobrar sesión" mostrarán siempre el importe correcto, y la RPC recibirá el valor real.
