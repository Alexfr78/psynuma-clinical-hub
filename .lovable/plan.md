

## Plan: Corregir filtro de eventos de calendario en reprogramación

### Problema raíz
El evento "Maricongelada" tiene `deleted: false` (booleano), pero la función `public-session-reschedule` filtra con `.is("deleted", null)`, que solo coincide con valores `NULL`. Como `false ≠ NULL`, el evento se excluye de la consulta y no se detecta como conflicto.

La función `public-booking` lo hace correctamente usando `.eq("deleted", false)`.

### Solución
Cambiar `.is("deleted", null)` por `.eq("deleted", false)` en las dos consultas a `calendar_events` dentro de `public-session-reschedule`:

1. **Línea 620** (función `getAvailability`): `.is("deleted", null)` → `.eq("deleted", false)`
2. **Línea 766** (función `checkDayHasAvailability`): `.is("deleted", null)` → `.eq("deleted", false)`

### Archivo a modificar
- `supabase/functions/public-session-reschedule/index.ts` — dos líneas

