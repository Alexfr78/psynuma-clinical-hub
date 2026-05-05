## Problema

Ger Arribas tiene una **tarifa personalizada** para "Sesión Clínica" (1,00 € en vez de 75,00 €), pero al crear una sesión nueva desde la agenda se aplicó el precio base (75 €).

## Causa raíz

Existen **tres** caminos de creación de sesión y solo uno aplica las tarifas personalizadas:

| Componente | ¿Aplica `resolve_effective_price`? |
|---|---|
| `CreateSessionDialog.tsx` | Sí — usa `useResolvedPrice` y rellena `price`, `pricing_source`, `custom_price_id`, `tariff_plan_*_snapshot` |
| `QuickCreateSessionDialog.tsx` | **No** — usa solo `selectedSessionType?.default_price` (línea 435) |
| `MobileSessionForm.tsx` | **No** — solo lee `sessionTypes` |

`QuickCreateSessionDialog` es el que se abre al pulsar un hueco de la agenda; por eso la sesión del 21 de mayo se creó con 75 €.

## Solución

Replicar en `QuickCreateSessionDialog` (y en `MobileSessionForm`) la lógica de resolución de precio:

1. Importar `useResolvedPrice` de `@/hooks/useCustomPrices`.
2. Llamarlo con el `patient_id` y `session_type_id` actuales y la `session_date` como `referenceDate`.
3. En `executeSessionCreation` (línea 432) y en la rama de serie recurrente, sustituir:
   ```ts
   const sessionPrice = selectedSessionType?.default_price ?? 0;
   ```
   por el precio resuelto cuando exista y no haya bono:
   ```ts
   const sessionPrice = (resolvedPrice && (!usesBono))
     ? resolvedPrice.applied_price
     : (selectedSessionType?.default_price ?? 0);
   ```
4. Añadir al payload de `createSession.mutateAsync` (y `createRecurringSeries`) los snapshots de pricing (consistentes con `CreateSessionDialog`):
   ```ts
   base_price_snapshot: resolvedPrice?.base_price ?? sessionPrice,
   pricing_source: resolvedPrice?.pricing_source ?? 'base',
   custom_price_id: resolvedPrice?.custom_price_id ?? null,
   tariff_plan_id_snapshot: resolvedPrice?.tariff_plan_id ?? null,
   tariff_plan_assignment_id_snapshot: resolvedPrice?.tariff_plan_assignment_id ?? null,
   ```
5. Aplicar el mismo patrón en `MobileSessionForm.tsx` para que la creación móvil también respete la tarifa.

## Corrección del dato existente

La sesión ya creada del 21 de mayo de Ger Arribas seguirá con 75 €. Tras desplegar el fix, también actualizo manualmente esa sesión al precio resuelto (1,00 €) y su deuda asociada para que cuadre con la tarifa personalizada.

## Archivos a modificar

- `src/components/agenda/QuickCreateSessionDialog.tsx`
- `src/components/agenda/MobileSessionForm.tsx`
- Migración / update directo para corregir la sesión del 21 may de Ger Arribas
