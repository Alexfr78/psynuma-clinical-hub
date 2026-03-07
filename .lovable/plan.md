

## Análisis: Garantizar secuencia continua de envío Verifactu a AEAT

### Problema raíz

El sistema actual permite que una factura obtenga un número de serie definitivo (ej: SP260011) pero **nunca sea enviada a AEAT**. Esto ocurre porque:

1. **La numeración y el envío a AEAT son operaciones desacopladas**: Primero se asigna número (al emitir), luego se firma con Verifactu como paso separado. Si el envío falla o la factura se cancela antes del envío, queda un hueco.

2. **No hay control sobre cambios de estado post-emisión**: `useUpdateInvoiceStatus` permite cambiar a `cancelled` sin verificar si la factura ya fue enviada a AEAT. Si no fue enviada, el hueco es permanente.

3. **El retry automático no garantiza orden**: `retry-pending-verifactu` reintenta facturas pendientes por `created_at`, pero si hay varias facturas pendientes de diferentes series, el orden de envío puede no ser cronológico.

4. **La creación de facturas desde múltiples puntos no centraliza el envío**: Hay 6+ puntos que invocan `sign-invoice-verifactu` (CreateSimpleInvoiceDialog, CreateSessionInvoiceDialog, CreateRectificativaDialog, useIssueInvoice, useCreateSignedInvoice, stripe-webhook). Cada uno tiene su propio manejo de errores.

### Vulnerabilidades concretas identificadas

```text
PUNTO DE FALLO                    → CONSECUENCIA
─────────────────────────────────────────────────────
1. Factura emitida + Verifactu     → Número consumido, hueco en AEAT
   falla + usuario cancela           si no se reenvía antes de cancelar
   localmente

2. Factura emitida + red cae       → verifactu_pending=true, pero si
   durante sign-invoice              usuario la cancela antes del retry,
                                     hueco permanente

3. Dos facturas emitidas casi      → Ambas leen el mismo previousHash
   simultáneamente                   de verifactu_chain_status,
                                     una fallará por hash incorrecto
                                     (race condition en la cadena)

4. retry-pending-verifactu envía   → Podría enviar factura #13 antes
   facturas sin respetar orden       que #12 si #12 tuvo error temporal
   cronológico estricto              y #13 se creó después
```

### Plan de solución

#### 1. Hacer el envío a AEAT atómico con la emisión

Modificar el flujo para que **no se pueda emitir una factura sin enviarla a AEAT** cuando Verifactu está activado. Si el envío falla, la factura queda en estado `issued` con `verifactu_pending=true`, pero **no se puede cancelar** mientras esté pendiente.

**Archivos**: `src/hooks/useInvoices.tsx` (useUpdateInvoiceStatus)

- Al intentar cancelar una factura `issued` sin `verifactu_hash`, bloquear la operación y devolver un error explicativo: "Esta factura está pendiente de registro en AEAT. No puede cancelarse hasta que se registre."

#### 2. Bloqueo de concurrencia en la cadena

Añadir un mecanismo de bloqueo en `sign-invoice-verifactu` para evitar que dos facturas se firmen simultáneamente para el mismo centro/NIF/instalación.

**Archivo**: `supabase/functions/sign-invoice-verifactu/index.ts`

- Usar `pg_advisory_lock` (vía función RPC) basado en el `center_id` antes de leer el `verifactu_chain_status` y liberar después del update.
- Alternativa más simple: usar un campo `locked_at` en `verifactu_chain_status` con un timeout de 60 segundos.

**Migración SQL**: Crear función RPC `acquire_verifactu_chain_lock` y `release_verifactu_chain_lock`.

#### 3. Orden estricto en reintentos

Modificar `retry-pending-verifactu` para procesar facturas **en orden de `issue_date` + `invoice_number`**, y detenerse ante el primer fallo (no continuar con la siguiente si la anterior no se envió).

**Archivo**: `supabase/functions/retry-pending-verifactu/index.ts`

- Ordenar por `issue_date ASC, invoice_number ASC`.
- Si una factura falla, **detener el proceso** para ese centro (no enviar las siguientes, ya que romperían la cadena).

#### 4. Proteger la cancelación de facturas emitidas sin registro AEAT

**Archivo**: `src/hooks/useInvoices.tsx` (useUpdateInvoiceStatus)

- Antes de permitir `status = 'cancelled'` en una factura con estado `issued`:
  - Si `verifactu_hash` existe → permitir cancelación (ya está en AEAT, se puede enviar baja después).
  - Si `verifactu_hash` es null Y el centro tiene Verifactu activado → **bloquear** con mensaje: "Debe registrar primero esta factura en AEAT antes de poder anularla. Use 'Registrar en AEAT' desde el detalle de la factura."
  - Si `verifactu_pending = true` → **bloquear** con mensaje: "Hay un envío pendiente a AEAT. Espere a que se complete o reintente manualmente."

#### 5. Indicador visual de facturas sin registrar

**Archivo**: `src/components/invoices/InvoiceCard.tsx`

- Mostrar un icono/badge de advertencia en facturas con estado `issued` o `paid` que no tienen `verifactu_hash` cuando el centro tiene Verifactu activado.

**Archivo**: `src/pages/Invoices.tsx`

- Añadir un banner de alerta cuando existan facturas emitidas sin registrar en AEAT.

### Archivos afectados (resumen)

| Archivo | Cambio |
|---|---|
| `supabase/functions/sign-invoice-verifactu/index.ts` | Añadir bloqueo de concurrencia con lock en chain_status |
| `supabase/functions/retry-pending-verifactu/index.ts` | Orden estricto por fecha/número, parar ante primer fallo por centro |
| `src/hooks/useInvoices.tsx` | Bloquear cancelación de facturas issued sin verifactu_hash |
| `src/pages/Invoices.tsx` | Banner de alerta para facturas huérfanas |
| `src/components/invoices/InvoiceCard.tsx` | Badge de advertencia visual |
| Migración SQL | Campo `locked_at` en `verifactu_chain_status` o función de advisory lock |

### Lo que NO cambia

- El flujo de emisión sigue siendo: crear factura → asignar número → enviar a AEAT.
- No se añade ningún mecanismo de "registrar y anular" automático (como propuse antes), ya que como bien dices, las correcciones se hacen mediante facturas rectificativas, no anulaciones.
- La cadena criptográfica (`verifactu_chain_status`) sigue siendo la fuente de verdad para el hash anterior.

