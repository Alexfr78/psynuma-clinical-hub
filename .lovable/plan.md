## Problema

Al crear un bono desde el detalle de una cita **abierta desde el Dashboard**, el bono se aplica correctamente en la base de datos (`sessions.bono_id` queda asignado), pero al reabrir el detalle de la cita el desplegable muestra "Sin bono".

## Causa

El Dashboard carga las citas de hoy con la query key `['today-sessions']` (`src/pages/Dashboard.tsx` línea 82). Los hooks de bonos (`useApplyBonoToSession`, `useRemoveBonoFromSession` en `src/hooks/useBonos.tsx`) invalidan `['sessions']`, que **no coincide** con `['today-sessions']`. Resultado: la lista del Dashboard nunca se refresca tras aplicar el bono.

Además, a diferencia de `Agenda.tsx`, el Dashboard no re-sincroniza el `selectedSession` con la lista refrescada, así que aunque se refrescase, seguiría mostrando el snapshot antiguo al reabrir.

## Cambios

1. **`src/pages/Dashboard.tsx`** — cambiar la queryKey de `useTodaySessions` a `['sessions', 'today']` para que cualquier invalidación de `['sessions']` (bonos, pagos, actualizaciones) también refresque las citas de hoy del Dashboard.

2. **`src/pages/Dashboard.tsx`** — añadir un `useEffect` que re-sincronice `selectedSession` con la lista `todaySessions` cuando cambie (mismo patrón que `Agenda.tsx` líneas 235-243), para que al reabrir el drawer se vean los datos frescos (bono, precio, estado, etc.).

No se modifica lógica de negocio, sólo el caching/estado en la capa de presentación del Dashboard.
