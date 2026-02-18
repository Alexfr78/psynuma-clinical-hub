
## Fix: Restaurar precio de sesion al quitar bono

### Problema
Cuando se asigna un bono a una sesion, el RPC `apply_bono_to_session` establece `price = 0`. Pero al quitar el bono, el RPC `remove_bono_from_session` solo desvincula el bono (`bono_id = NULL`) sin restaurar el precio original. La sesion queda en 0.00 EUR permanentemente.

### Causa raiz
El RPC `remove_bono_from_session` (linea 346-349 de la migracion) solo hace:
```sql
UPDATE sessions SET bono_id = NULL, updated_at = now() WHERE id = p_session_id;
```
No restaura `price` ni `payment_status`.

### Solucion

#### 1. Migracion SQL: Actualizar `remove_bono_from_session`

Modificar la funcion para que al quitar un bono:
- Busque el `session_type` de la sesion y lo cruce con `session_types` (case-insensitive) para obtener el `default_price`
- Restaure el `price` al valor por defecto del tipo de sesion
- Restaure `payment_status` a `'pending'`
- Si no encuentra coincidencia en `session_types`, deje el precio como esta (seguridad)
- Devuelva el precio restaurado en el JSON de respuesta para que el frontend lo use

```sql
-- Dentro de remove_bono_from_session, reemplazar el UPDATE de sessions:
DECLARE
  v_default_price numeric;
  v_session_type text;
BEGIN
  -- ... security checks existentes ...

  -- Obtener tipo de sesion
  SELECT session_type INTO v_session_type
  FROM sessions WHERE id = p_session_id;

  -- Buscar precio por defecto del tipo (case-insensitive)
  SELECT default_price INTO v_default_price
  FROM session_types
  WHERE center_id = v_session_center_id
    AND LOWER(name) = LOWER(v_session_type)
  LIMIT 1;

  -- Restaurar sesion con precio original
  UPDATE sessions
  SET bono_id = NULL,
      price = COALESCE(v_default_price, price),
      payment_status = CASE WHEN v_default_price IS NOT NULL AND v_default_price > 0 THEN 'pending' ELSE payment_status END,
      updated_at = now()
  WHERE id = p_session_id;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted', v_deleted,
    'restored_price', COALESCE(v_default_price, 0)
  );
END;
```

#### 2. Cliente: Actualizar `SessionDetailDrawer.tsx`

En `handleBonoChange`, despues de llamar a `removeBonoFromSession.mutateAsync`, usar el precio devuelto por el RPC para actualizar `localPrice`:

```typescript
// Linea ~717 en handleBonoChange
const result = await removeBonoFromSession.mutateAsync(session.id);
const restoredPrice = (result as any)?.restored_price ?? Number(session.price);
setLocalPrice(restoredPrice);
```

### Archivos a modificar
- Nueva migracion SQL para actualizar la funcion `remove_bono_from_session`
- `src/components/agenda/SessionDetailDrawer.tsx` - Restaurar `localPrice` tras quitar bono
