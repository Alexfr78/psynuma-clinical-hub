## Problema

El día 7 (jueves) hay un horario personalizado (`special_day` tipo `custom`) asignado a Alejandro Fernández. La agenda ya pinta los días especiales en Mes/Semana/Día, pero solo cuando el filtro de profesional coincide:

- En `WeekView`, `DayView` y `MonthView` se hace `pickApplicableSpecialDay(dateKey, professionalFilter, specialDays)`.
- `professionalFilter = selectedProfessional === 'all' ? null : selectedProfessional`.
- En `special-days-helpers.ts > matchesScope`, si `professionalId == null` y el día especial es de scope `professional`, devuelve `false` → no se muestra.

Resultado: cuando el usuario está viendo "Todos los profesionales" (vista por defecto), el día especial de Alejandro queda invisible.

## Solución

Cuando el filtro es "todos", mostrar también los días especiales de scope `professional`, indicando a qué profesional pertenecen.

### Cambios

1. **`src/lib/special-days-helpers.ts`**
   - Nueva función `getApplicableSpecialDaysForDisplay(date, professionalFilter, specialDays)`:
     - Si `professionalFilter` es un id concreto → devuelve `[pickApplicableSpecialDay(...)]` (comportamiento actual, máximo uno).
     - Si `professionalFilter` es `null` (vista "todos") → devuelve el día de scope `center` aplicable (si existe) + todos los de scope `professional` aplicables a esa fecha, ordenados.
   - Mantener las funciones existentes intactas para no romper la lógica de bloqueo (`isDateBlockedBySpecialDay` sigue usando `pickApplicableSpecialDay`).

2. **`src/pages/Agenda.tsx`**
   - Pasar a `WeekView`, `DayView` y `MonthView` un mapa `professionalNames: Record<string, string>` (id → "Alejandro F.") construido desde el hook ya existente `useProfessionals` o desde las sesiones cargadas. Esto permite mostrar el nombre del profesional en el badge sin nuevas queries.

3. **`MonthView.tsx`**
   - Reemplazar `pickApplicableSpecialDay` por el nuevo helper.
   - Renderizar un badge por cada día especial aplicable (máx. 2 visibles + “+N”). Cada badge muestra `🕒 Personalizado · Alejandro F.` cuando es scope `professional` y el filtro es "todos".
   - Si hay al menos uno, aplicar el `SPECIAL_DAY_BG` del primero como fondo (igual que ahora).

4. **`WeekView.tsx`**
   - Mismo cambio: en cada columna de día, listar todos los días especiales aplicables como mini-badges apilados bajo el header del día (debajo del número), con icono + nombre del profesional cuando aplique.
   - Mantener el tinte de fondo de la columna usando el primero de la lista.

5. **`DayView.tsx`**
   - Reemplazar el banner único por un banner por cada día especial aplicable (uno debajo del otro), incluyendo nombre del profesional cuando es scope `professional` y el filtro es "todos".

### Notas

- No se cambia la lógica de bloqueo de creación/movimiento de sesiones: sigue dependiendo del profesional seleccionado al crear la cita, lo cual es correcto.
- No hay cambios de base de datos.
- El cambio es puramente visual/UI; no afecta a edge functions ni a la disponibilidad pública.