

## Plan: Implementar trigger SQL, desmarcado UI, limpieza de campos y fallback determinista

### 1. Migración SQL — `enforce_single_default_per_day`

Crear migración con este SQL exacto:

```sql
CREATE OR REPLACE FUNCTION public.enforce_single_default_per_day()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_center_id uuid;
BEGIN
  -- Only act when setting is_default to true
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip if is_default didn't actually change
  IF TG_OP = 'UPDATE' AND OLD.is_default IS NOT DISTINCT FROM NEW.is_default THEN
    RETURN NEW;
  END IF;

  -- Resolve center_id from the location
  SELECT center_id INTO v_center_id
  FROM public.center_locations WHERE id = NEW.location_id;

  -- Guard: if location not found, do nothing
  IF v_center_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Unset is_default on other schedules for same day+center
  UPDATE public.location_schedules ls
  SET is_default = false
  FROM public.center_locations cl
  WHERE ls.location_id = cl.id
    AND cl.center_id = v_center_id
    AND ls.day_of_week = NEW.day_of_week
    AND ls.id IS DISTINCT FROM NEW.id
    AND ls.is_default = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_default_per_day ON public.location_schedules;
CREATE TRIGGER trg_enforce_single_default_per_day
BEFORE INSERT OR UPDATE ON public.location_schedules
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_per_day();
```

### 2. UI desmarcado — `LocationsSection.tsx`

En `handleScheduleChange` (línea 443-468), cuando `field === 'is_default'` y `value === true`, antes del upsert principal, desmarcar los demás schedules del mismo `day_of_week` con `is_default=true`:

```typescript
const handleScheduleChange = async (
  locationId: string,
  day: number,
  field: 'is_open' | 'start_time' | 'end_time' | 'is_default',
  value: boolean | string
) => {
  setUpdatingLocation(locationId);

  const currentSchedule = allSchedules?.find(
    s => s.location_id === locationId && s.day_of_week === day
  );

  try {
    // When marking a location as default, unmark others for the same day
    if (field === 'is_default' && value === true && allSchedules) {
      const otherDefaults = allSchedules.filter(
        s => s.day_of_week === day && s.location_id !== locationId && s.is_default === true
      );
      for (const other of otherDefaults) {
        await upsertSchedule.mutateAsync({
          location_id: other.location_id,
          day_of_week: day,
          start_time: other.start_time,
          end_time: other.end_time,
          is_open: other.is_open ?? true,
          is_default: false,
        });
      }
    }

    await upsertSchedule.mutateAsync({
      location_id: locationId,
      day_of_week: day,
      start_time: field === 'start_time' ? (value as string) : (currentSchedule?.start_time || '09:00'),
      end_time: field === 'end_time' ? (value as string) : (currentSchedule?.end_time || '21:00'),
      is_open: field === 'is_open' ? (value as boolean) : (currentSchedule?.is_open ?? true),
      is_default: field === 'is_default' ? (value as boolean) : (currentSchedule?.is_default ?? false),
    });
  } catch (error) {
    toast.error('Error al actualizar el horario');
  } finally {
    setUpdatingLocation(null);
  }
};
```

### 3. Limpieza de campos — `QuickCreateSessionDialog.tsx`

Líneas 292-297, reemplazar el bloque dentro del `useEffect`:

```typescript
if (result) {
  form.setValue('session_modality', result.modality);
  if (result.isOnline) {
    form.setValue('location_id', '');
  } else {
    form.setValue('location_id', result.locationId);
    form.setValue('video_call_link', '');
  }
}
```

### 4. Fallback determinista — `location-defaults.ts`

Líneas 64-70, reemplazar:

```typescript
const candidates =
  publicLocations.length > 0 ? publicLocations : privateLocations;

if (candidates.length === 0) return null;

const sorted = [...candidates].sort((a, b) => a.name.localeCompare(b.name));
return toDefault(sorted[0], defaultVideoProvider);
```

### Archivos afectados

| Archivo | Cambio |
|---|---|
| Nueva migración SQL | Trigger `enforce_single_default_per_day` con guards `v_center_id IS NULL` y `ls.id IS DISTINCT FROM NEW.id` |
| `src/components/settings/LocationsSection.tsx` | Desmarcar otros defaults del mismo día antes de marcar el nuevo |
| `src/components/agenda/QuickCreateSessionDialog.tsx` | Limpiar `location_id` (online) o `video_call_link` (presencial) |
| `src/lib/location-defaults.ts` | Sort por `name` para fallback determinista |

