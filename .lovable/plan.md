## Problema

En `/facturas` aparece **60€** en "Cobrado" y "Facturado" pese a que **no hay ninguna factura de mayo**. La factura SF260060 (fecha 30 de abril) se está colando en el cálculo del mes actual.

## Causa raíz

En `src/hooks/useInvoices.tsx` (función `useInvoiceStats`, línea 478-480) el rango del mes se calcula así:

```js
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
```

`new Date(2026, 4, 1)` se construye en hora **local** (00:00 España). Al llamar `.toISOString()` se convierte a UTC y, en horario de verano (CEST, UTC+2), da `2026-04-30T22:00:00Z`. Tras `.split('T')[0]` queda **`'2026-04-30'`**, no `'2026-05-01'`.

Resultado: la consulta `issue_date >= '2026-04-30'` incluye la factura SF260060 del 30 de abril.

## Solución

Calcular `startOfMonth` y `endOfMonth` formateando la fecha **localmente** (sin pasar por UTC), de modo que el rango sea `2026-05-01` … `2026-05-31`.

### Cambio único en `src/hooks/useInvoices.tsx`

Reemplazar las dos líneas afectadas por:

```ts
const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();
const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const startOfMonth = fmt(new Date(y, m, 1));
const endOfMonth = fmt(new Date(y, m + 1, 0));
```

## Resultado esperado

- En mayo (sin facturas): **Facturado 0€ · Cobrado 0€ · Pendiente 0€**.
- Las tarjetas reflejarán solo facturas con `issue_date` realmente dentro del mes calendario local.

## Notas

- El bug afecta cualquier zona horaria con offset positivo respecto a UTC (toda Europa continental). Por eso solo se nota el día 1 del mes y empeora durante el verano.
- Mantengo los nombres actuales de las tarjetas ("Facturado este mes / Facturas pagadas / Pendiente de cobro") tal como quedaron en el cambio anterior.
