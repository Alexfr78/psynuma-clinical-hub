

## Plan: Calendario mensual en Portal del Paciente

### Problema
El selector de fecha actual avanza semana a semana, obligando al paciente a navegar muchas veces para encontrar disponibilidad. La página pública de booking (`PublicBooking.tsx`) ya usa un calendario mensual con `getMonthAvailability`, pero el portal del paciente (`PortalBooking.tsx`) no.

### Solución
Reemplazar la vista semanal (líneas 539-651) por un calendario mensual con indicadores de disponibilidad en los días, y al pulsar un día, mostrar las horas disponibles debajo.

### Cambios en `src/components/portal/PortalBooking.tsx`

1. **Nuevo endpoint de disponibilidad mensual**: La función `getAvailability` del portal solo devuelve slots de un día. Para no hacer 30 llamadas individuales, añadir una nueva prop `getMonthAvailability` al componente que devuelva los días con disponibilidad del mes. El componente padre (`PatientPortalDashboard.tsx`) ya llama a un edge function — se añadirá una nueva acción `get-month-availability` al edge function `patient-portal-sessions`.

2. **Estado**: Reemplazar `weekStart` y `weekSlots` por:
   - `currentMonth: Date` — mes visible en el calendario
   - `monthAvailability: Record<string, number>` — mapa fecha→cantidad de slots
   - `selectedDay: Date | null` — día seleccionado
   - `daySlots: string[]` — slots del día seleccionado
   - `daySlotsLoading: boolean`

3. **Calendario mensual** (usando `Calendar` de shadcn/DayPicker):
   - `modifiers` para marcar días con disponibilidad (punto verde)
   - `disabled` para días sin disponibilidad y días pasados
   - Al cambiar de mes → cargar disponibilidad del nuevo mes
   - Al pulsar un día → llamar `getAvailability` para ese día y mostrar slots debajo

4. **Slots del día seleccionado**: Debajo del calendario, mostrar los botones de hora (misma UI actual pero solo para el día seleccionado).

### Cambios en `src/pages/PatientPortalDashboard.tsx`
- Pasar nueva prop `getMonthAvailability` al `PortalBooking`.

### Cambio en edge function `supabase/functions/patient-portal-sessions/index.ts`
- Añadir acción `get-month-availability` que itere los días del mes y devuelva cuáles tienen slots disponibles (reutilizando la lógica existente de availability).

### Archivos afectados
- `supabase/functions/patient-portal-sessions/index.ts` — nueva acción `get-month-availability`
- `src/pages/PatientPortalDashboard.tsx` — pasar nueva prop
- `src/components/portal/PortalBooking.tsx` — reemplazar vista semanal por calendario mensual + slots por día

