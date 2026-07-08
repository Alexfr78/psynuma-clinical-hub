## Diagnóstico

Las tarjetas superiores de `/facturas` ("Facturado este mes", "Facturas pagadas", "Pendiente de cobro") se calculan en `useInvoiceStats` (`src/hooks/useInvoices.tsx`, líneas 479–524). Actualmente **suman todas las facturas del mes** sin filtrar por validez ni por estado cancelado.

Datos comprobados en BD para las facturas mencionadas:

| Nº | Total | Estado | is_valid | Rectificada por |
|---|---|---|---|---|
| SP260022 | +75 € | paid | **false** | RS260002 (−75 €, sustitución) |
| SF260053 | +75 € | paid | **false** | RP260002 (−10 €, diferencias) |

Al sumarse los cuatro (75 − 75 + 75 − 10 = **65 €**) sobre el mes, aparece el desajuste que se observa en las tarjetas: las originales anuladas siguen contando y las rectificativas negativas restan encima, dando un resultado que no refleja la realidad fiscal.

## Cambio propuesto

En `useInvoiceStats` (`src/hooks/useInvoices.tsx`), al leer la tabla `invoices`:

1. Traer también los campos `is_valid` y `rectification_type`.
2. Excluir del cómputo:
   - Facturas con `status = 'cancelled'`.
   - Facturas con `is_valid = false` (originales que fueron sustituidas/anuladas por una rectificativa).
3. Para el resto (incluidas las rectificativas, que ya llevan el importe neto correcto — negativo en sustituciones, delta en "diferencias"), mantener la lógica actual de acumulación por estado (`issued` / `paid`).

Resultado esperado en las tarjetas del mes de abril 2026 con las facturas mencionadas:
- La original SP260022 (+75, anulada) deja de contar.
- La rectificativa RS260002 (−75, sustitución) sí cuenta → efecto neto correcto: −75 € (anulación total).
- La original SF260053 (+75, anulada) deja de contar.
- La rectificativa RP260002 (−10, diferencias) sí cuenta → efecto neto correcto: −10 € (ajuste a la baja).

Es decir, el "Facturado este mes" reflejará el saldo fiscal real emitido, sin duplicar los importes anulados.

## Alcance

- **Archivos modificados:** solo `src/hooks/useInvoices.tsx` (función `useInvoiceStats`).
- **Sin cambios** en la tabla, políticas RLS, listado de facturas ni en el gráfico "Evolución de facturación" (ese usa otra query — si más adelante ves el mismo desfase allí, lo abordamos aparte).

## Confirmación

¿Quieres que aplique este criterio (excluir originales anuladas + canceladas, mantener rectificativas con su importe neto)? Con la evolución de facturación (gráfico inferior con los 1400 € / 2921 €) puedo revisar si presenta el mismo problema y arreglarlo en el mismo cambio si lo pides.
