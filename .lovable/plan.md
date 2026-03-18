

## Plan: Días No Laborables (Schedule Exceptions)

### Arquitectura

Nueva tabla `schedule_exceptions` + hook `useScheduleExceptions` + UI de gestión en Settings + validación en creación de citas + indicadores visuales en la agenda.

### 1. Modelo de datos — Nueva tabla `schedule_exceptions`

```sql
CREATE TYPE schedule_exception_scope AS ENUM ('center', 'professional');
CREATE TYPE schedule_exception_reason AS ENUM ('holiday', 'vacation', 'sick_leave', 'training', 'closure', 'other');

CREATE TABLE schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scope schedule_exception_scope NOT NULL DEFAULT 'center',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  reason_type schedule_exception_reason NOT NULL DEFAULT 'other',
  reason_label TEXT,
  notes TEXT,
  affects_booking BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT valid_scope CHECK (
    (scope = 'center' AND professional_id IS NULL) OR
    (scope = 'professional' AND professional_id IS NOT NULL)
  )
);

ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;
-- RLS: users can CRUD exceptions for their own center
```

Habilitar realtime para ver cambios en tiempo real en la agenda.

### 2. Hook — `src/hooks/useScheduleExceptions.tsx`

- `useScheduleExceptions(centerId, dateRange?)` — fetch exceptions in range
- `useCreateScheduleException` — mutation con detección de citas afectadas
- `useUpdateScheduleException` — mutation
- `useDeleteScheduleException` — mutation
- `useCheckDateBlocked(centerId, professionalId, date)` — helper que devuelve si una fecha está bloqueada y por qué motivo (center/professional)

### 3. UI de Gestión

#### 3a. Nueva sección en Settings: "Días no laborables"
- **Archivo**: `src/components/settings/ScheduleExceptionsSection.tsx`
- Añadir nueva entrada en `navItems` de `Settings.tsx` bajo "Mi Centro": `{ id: 'centro-excepciones', label: 'Días no laborables', icon: Ban, parent: 'Mi Centro' }`
- Lista de excepciones existentes con filtros (scope, rango)
- Botón "Añadir bloqueo" que abre un dialog

#### 3b. Dialog de creación/edición: `CreateScheduleExceptionDialog.tsx`
- Campos: scope (center/professional), profesional (si scope=professional), fecha inicio/fin, todo el día, hora inicio/fin (si no todo el día), reason_type, reason_label, notes, affects_booking
- Al guardar: consultar si hay citas en ese rango → mostrar advertencia con lista de citas afectadas antes de confirmar

### 4. Validación en creación de citas

#### 4a. `src/lib/schedule-exceptions.ts` — función pura
```typescript
export function isDateBlocked(
  date: Date,
  startTime: string,
  endTime: string,
  professionalId: string,
  exceptions: ScheduleException[]
): { blocked: boolean; reason: string; scope: 'center' | 'professional' } | null
```

#### 4b. Integrar en `QuickCreateSessionDialog.tsx`
- Fetch exceptions para el rango visible
- Antes del submit (junto a la detección de conflictos existente), verificar `isDateBlocked`
- Si bloqueado → toast con mensaje claro: "El centro está cerrado ese día (Festivo)" o "El profesional X no está disponible (Vacaciones)"

#### 4c. Integrar en `MobileSessionForm.tsx`
- Misma validación

#### 4d. Integrar en `public-booking/index.ts` edge function
- Consultar `schedule_exceptions` al calcular slots disponibles, filtrando fechas/horas bloqueadas

### 5. Indicadores visuales en la agenda

#### 5a. `DayView.tsx` y `WeekView.tsx`
- Pasar exceptions como prop desde `Agenda.tsx`
- Si el día tiene excepción center: fondo sombreado + banner "Centro cerrado — {reason_label}"
- Si el día tiene excepción professional (y se filtra por ese profesional): fondo sombreado + banner "No disponible — {reason_label}"
- Colores diferenciados: center = rojo/gris, professional = naranja/amarillo

#### 5b. `MonthView.tsx`
- Indicador visual (punto o sombreado) en días con excepciones

#### 5c. `Agenda.tsx`
- Fetch `schedule_exceptions` para el rango de fechas visible
- Pasar como prop a las vistas

### 6. Archivos a crear/modificar

| Acción | Archivo |
|--------|---------|
| **Crear** | `supabase/migrations/...schedule_exceptions.sql` |
| **Crear** | `src/hooks/useScheduleExceptions.tsx` |
| **Crear** | `src/lib/schedule-exceptions.ts` |
| **Crear** | `src/components/settings/ScheduleExceptionsSection.tsx` |
| **Crear** | `src/components/settings/CreateScheduleExceptionDialog.tsx` |
| **Modificar** | `src/pages/Settings.tsx` — añadir sección |
| **Modificar** | `src/pages/Agenda.tsx` — fetch + pasar exceptions |
| **Modificar** | `src/components/agenda/DayView.tsx` — indicadores visuales |
| **Modificar** | `src/components/agenda/WeekView.tsx` — indicadores visuales |
| **Modificar** | `src/components/agenda/MonthView.tsx` — indicadores visuales |
| **Modificar** | `src/components/agenda/QuickCreateSessionDialog.tsx` — validación |
| **Modificar** | `src/components/agenda/MobileSessionForm.tsx` — validación |
| **Modificar** | `supabase/functions/public-booking/index.ts` — filtrar slots bloqueados |

### 7. Preparado para futuras ampliaciones

- El campo `all_day`/`start_time`/`end_time` permite bloqueos parciales del día
- La estructura soporta añadir recurrencia (campo `rrule_json` futuro)
- El enum `reason_type` es extensible
- La separación en tabla propia permite consultas eficientes sin tocar horarios habituales

