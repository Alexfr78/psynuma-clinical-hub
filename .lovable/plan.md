## Diagnóstico

La sesión del 25 de mayo de Alejandro Macías Torre (id `9068712f…`) tiene **dos registros de deuda** por 75€:

1. **Deuda huérfana pendiente** (id `f978872f…`)
   - Creada el 26/05 a las **06:00 UTC** por el cron `generate-pending-debts`
   - Sin `invoice_id`, status `pending` → es la que aparece en la captura
2. **Deuda pagada correcta** (id `30a4a3b8…`)
   - Creada el 26/05 a las **06:28 UTC** al emitir la factura `4a5f8a51…`
   - Vinculada a la factura y al pago con tarjeta de 75€

**Causa raíz:** condición de carrera. El cron de generación de deudas se ejecutó a las 06:00 (sesión ya vencida, sin factura aún, sin deuda) y creó la pendiente. 28 min después, al emitir la factura, la automatización de facturas creó **otra** deuda enlazada a la factura en lugar de reutilizar la pendiente existente. El cron filtra por `session_id` para no duplicar, pero la creación vía factura no comprueba si ya existe una deuda pendiente para la misma sesión.

Revisé la BD del paciente y solo este caso presenta el duplicado actualmente.

## Plan

### 1. Corregir el dato (migración puntual)
Eliminar la deuda huérfana `f978872f-5c53-41a5-9987-7da1ba4ecbeb` (status `pending`, `invoice_id` null, mismo `session_id` que otra deuda ya pagada y facturada).

### 2. Prevenir la condición de carrera (estructural)
Añadir una **restricción única parcial** en `debts` que impida tener más de una deuda activa por sesión:

```sql
CREATE UNIQUE INDEX debts_one_active_per_session
  ON public.debts (session_id)
  WHERE session_id IS NOT NULL AND status <> 'cancelled';
```

Con esto, si el cron crea una deuda pendiente y después la facturación intenta crear otra para la misma sesión, la segunda inserción falla y la lógica debe reutilizar la existente.

### 3. Adaptar la lógica de facturación
En las funciones/RPC que crean deudas al emitir factura para una sesión (principalmente `collect_session_payment_v2` y la automatización de facturas en `20260421191827…`), antes de hacer `INSERT INTO debts`:

- Buscar una deuda existente con el mismo `session_id` y sin `invoice_id`.
- Si existe → hacer `UPDATE` enlazando `invoice_id`, ajustando `amount`/`due_date` y dejando que el recálculo de pagos marque el status final.
- Si no existe → `INSERT` como hasta ahora.

### 4. Reforzar el cron `generate-pending-debts`
Añadir un filtro adicional: excluir sesiones que ya tengan **cualquier** deuda activa (no solo por `session_id`, sino también revisar si la sesión está en proceso de facturación/cobro reciente). El filtro actual ya excluye sesiones con `invoice_items`, pero podemos hacerlo más conservador ejecutando el cron solo para sesiones con más de N horas de antigüedad (p. ej. 24h tras `session_date`) para reducir ventanas de carrera con facturación manual del mismo día.

## Detalles técnicos

- Archivos afectados:
  - Nueva migración SQL para: borrado puntual + índice único parcial.
  - `supabase/functions/generate-pending-debts/index.ts` → añadir margen temporal (24h) sobre `session_date`.
  - RPC `collect_session_payment_v2` (migración `20260409150000`) y trigger/función de auto-factura (`20260421191827`) → cambiar `INSERT` por `UPSERT` lógico sobre `(session_id) WHERE invoice_id IS NULL`.
- Sin cambios de UI.
- Verificación posterior: consultar `debts` del paciente y confirmar que solo queda la deuda pagada vinculada a la factura.

¿Procedo con esta limpieza + endurecimiento, o prefieres que solo borre la deuda huérfana sin tocar la lógica?
