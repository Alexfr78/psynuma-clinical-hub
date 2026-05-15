## Diagnóstico

**1. Pestaña "Tarifas" no aparece en el preview de Lovable**
- El código actual sí incluye la pestaña (`PatientDetailTabs.tsx` línea 44 con `value: 'pricing', label: 'Tarifas'`) y la importa desde `PatientCustomPrices`.
- El preview muestra "Previewing last saved version" y el botón Publicar está deshabilitado → el bundle servido no contiene los últimos cambios. Es un problema de build/cache, no de código.

**2. Precios de tarifa no se aplican al crear sesión (Zeus Lara)**
- En BD Zeus Lara tiene `patient_custom_prices` = 10€ para `session_type a35dcb38…` (precio base 75€) desde 2026‑04‑17, sin fecha fin.
- La función `resolve_effective_price(...)` devuelve correctamente `applied_price = 10`, `pricing_source = 'custom'`.
- Los dos diálogos de creación (`CreateSessionDialog` y `QuickCreateSessionDialog`) llaman a `useResolvedPrice` y aplican el precio al insertar.
- Sin embargo:
  - `useCreateSession` (en `useSessions.tsx`) inserta lo que reciba sin validar nada → cualquier flujo que no pase por esos diálogos (reserva pública `public-booking`, conversión de eventos de Google Calendar, recurrencias, edición manual) entra al precio base.
  - Hay condición de carrera: si el usuario envía antes de que la query `resolved-price` resuelva, se guarda el precio base.

## Plan

### Paso 1 — Restaurar la pestaña Tarifas en preview
- Forzar un commit/rebuild trivial (touch en `PatientDetailTabs.tsx` o reinicio del dev server) para que el preview sirva el bundle actualizado y el botón Publicar se habilite. Confirmar visualmente que aparece "Tarifas".

### Paso 2 — Blindar el precio en BD (corrección definitiva)
Crear un trigger `BEFORE INSERT` en `sessions` que, **si `custom_price_id` y `tariff_plan_assignment_id_snapshot` vienen `NULL`**, llame a `resolve_effective_price(patient_id, 'session_type', session_type_id, session_date)` y:
- Si `pricing_source != 'base'`: sobrescribe `price`, `base_price_snapshot`, `pricing_source`, `custom_price_id`, `tariff_plan_id_snapshot`, `tariff_plan_assignment_id_snapshot` con el resultado de la RPC.
- Si `pricing_source = 'base'`: rellena `base_price_snapshot` y `pricing_source = 'base'` por trazabilidad.

Esto garantiza que **cualquier** vía de inserción (UI desktop, móvil, reserva pública, sync de Google Calendar, recurrencias, edición masiva) aplique la tarifa correcta sin depender del frontend.

### Paso 3 — Backfill puntual (opcional, solo si lo confirmas)
Recalcular el precio de las sesiones de Zeus Lara creadas tras 2026‑04‑17 que aún tengan `pricing_source = 'base'` y no estén facturadas/cobradas, para corregir la deuda asociada. Solo lo aplico si me das luz verde, porque toca facturación.

### Paso 4 — Verificación
- Crear sesión de prueba para Zeus Lara → confirmar que el precio sale a 10€ aunque el formulario muestre otra cifra al pulsar Guardar.
- Probar reserva pública y conversión de evento de Google Calendar para Zeus → confirmar que el trigger también las corrige.

## Detalles técnicos

```sql
CREATE OR REPLACE FUNCTION public.apply_resolved_price_to_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NEW.session_type_id IS NULL OR NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Solo si nadie ya marcó una fuente explícita
  IF COALESCE(NEW.pricing_source,'') NOT IN ('custom','tariff_plan') THEN
    SELECT resolve_effective_price(
      NEW.patient_id, 'session_type', NEW.session_type_id, NEW.session_date::date
    ) INTO r;
    IF r IS NOT NULL THEN
      NEW.base_price_snapshot := COALESCE(NEW.base_price_snapshot, (r->>'base_price')::numeric);
      NEW.pricing_source      := COALESCE(r->>'pricing_source','base');
      IF (r->>'pricing_source') <> 'base' THEN
        NEW.price                              := (r->>'applied_price')::numeric;
        NEW.custom_price_id                    := NULLIF(r->>'custom_price_id','')::uuid;
        NEW.tariff_plan_id_snapshot            := NULLIF(r->>'tariff_plan_id','')::uuid;
        NEW.tariff_plan_assignment_id_snapshot := NULLIF(r->>'tariff_plan_assignment_id','')::uuid;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_resolved_price ON public.sessions;
CREATE TRIGGER trg_apply_resolved_price
BEFORE INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.apply_resolved_price_to_session();
```

No se modifica el frontend en este paso — el trigger es la red de seguridad. Dejo intacta la lógica de `useResolvedPrice` para que la UI siga mostrando el precio correcto en vivo.
