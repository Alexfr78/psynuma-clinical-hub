
## 1. Verificación con la AEAT

Según el **Reglamento de Facturación (RD 1619/2012, art. 15)** y la normativa Verifactu (RD 1007/2023), cuando se emite una factura con un error sustancial (por ejemplo, tipo de factura equivocado: simplificada en lugar de completa), existen **dos vías válidas**:

- **Vía A — Rectificativa por sustitución (recomendada por AEAT):** una única factura rectificativa que sustituye a la original indicando los datos correctos y la referencia a la factura rectificada. No se emite una segunda factura "nueva".
- **Vía B — Rectificativa por anulación + nueva factura:** una rectificativa "por diferencias" con importes negativos que anula la original, y a continuación una factura completa nueva con numeración correlativa distinta. Ambas quedan encadenadas en Verifactu.

Lo que has hecho (rectificativa total = anulación) es correcto y admitido por la AEAT, pero **está incompleto**: falta emitir la factura completa nueva (Vía B). La app actualmente bloquea esa segunda factura porque considera que la rectificativa sigue siendo una "factura válida" asociada al mismo hecho facturable.

Ambas vías son válidas ante AEAT; **Vía A** genera menos ruido en Verifactu (1 documento en lugar de 3), pero **Vía B** es más habitual en software clínico y es la que ya está a medio hacer en tu caso.

## 2. Cómo generar la factura completa ahora mismo (arreglo puntual + código)

**Causa técnica:** `useSessionInvoiceStatus` (src/hooks/useInvoices.tsx) considera "factura válida" cualquier invoice con `is_valid = true` y `status != 'cancelled'` ligada al `billable_event`. La rectificativa hereda `is_valid = true`, así que bloquea `canCreateInvoice`.

**Cambio de lógica:** una factura debe considerarse "neutralizada" (y por tanto permitir re-facturar la sesión) cuando existe una rectificativa **por diferencias que la anula íntegramente** (neto original + neto de rectificativas ligadas = 0) o **por sustitución** que ya cubre el hecho facturable.

Cambios en `useSessionInvoiceStatus`:
- Cargar también `rectified_invoice_id` y `total` (ya se hace) y calcular el **neto vivo** por cada factura original: `total_original + Σ totales de sus rectificativas`.
- `hasValidInvoice` pasa a considerar solo facturas con neto vivo ≠ 0 y no sustituidas.
- `canCreateInvoice = billable_event.billing_status === 'pending' && !hasLiveInvoice`.

Con eso, al abrir el detalle de la sesión afectada volverá a aparecer el botón **"Emitir factura"** y podrás elegir "Completa" en el diálogo existente (`CreateSessionInvoiceDialog`).

**Acción inmediata para tu factura ya rectificada:** desplegado el fix, entra al detalle de la sesión → *Emitir factura* → elige serie **Completa** y datos fiscales del contacto. Verifactu la encadenará como documento nuevo detrás de la rectificativa.

## 3. Automatización — "Corregir tipo de factura" en un clic

Nueva acción en el menú de una factura ya emitida (`InvoiceDetailDialog` / lista de facturas): **"Corregir tipo de factura"**.

Flujo:

```text
Factura original (p.ej. SF260090, simplificada)
        │
        ▼
1. Crear rectificativa por sustitución (misma serie rectificativa que ya usas)
   - tipo = 'complete' o 'simplified' según destino
   - rectified_invoice_id = original
   - rectification_type = 'substitution'
   - importes y líneas = copia exacta de la original
   - datos fiscales del destinatario = los correctos (NIF, dirección…)
        │
        ▼
2. Sellar en Verifactu (reutiliza seal-invoice-verifactu)
        │
        ▼
3. Reasignar cobros con handle_rectificativa_payments (ya existe)
        │
        ▼
4. Marcar original como sustituida (is_valid = false vía trigger existente)
```

Esto sigue la **Vía A** de AEAT (más limpia) y evita la necesidad de emitir una tercera factura. Un solo documento nuevo, cadena Verifactu correcta, cobros preservados.

Componentes a crear/modificar:

- **UI:** `src/components/invoices/FixInvoiceTypeDialog.tsx` (nuevo). Formulario con: tipo destino (Completa/Simplificada), serie rectificativa a usar, datos fiscales del contacto pre-rellenados y editables. Botón "Corregir".
- **Hook:** `src/hooks/useFixInvoiceType.tsx` (nuevo) que:
  1. Llama a `create_rectificativa_substitution` (RPC nueva) para crear la sustitutiva con los datos correctos y copiar items.
  2. Invoca `seal-invoice-verifactu`.
  3. Ejecuta `handle_rectificativa_payments`.
- **RPC/migración:** `create_rectificativa_substitution(p_original_invoice_id, p_target_invoice_type, p_series_id, p_fiscal_data jsonb)` que hace la copia transaccional (invoice + invoice_items + billable_event_id + rectified_invoice_id + rectification_type='substitution').
- **Trigger existente `protect_issued_invoices`:** sin cambios; la sustitutiva se crea nueva, no modifica la original.
- **Punto de entrada:** botón en `InvoiceDetailDialog` visible solo si la factura está emitida, sellada y `!rectified_invoice_id` (no es a su vez una rectificativa) y no tiene ya rectificativas activas.

### Manejo del caso ya rectificado (tu factura actual)

Como ya tienes la Vía B a medias, además del arreglo del punto 2, añadir un modo "sólo emitir nueva" al mismo diálogo: si la factura original ya tiene una rectificativa anulatoria, el diálogo detecta el escenario y solo emite la factura completa nueva enlazándola al mismo `billable_event`, sin crear otra rectificativa.

## Resumen de entregables

1. Fix en `useSessionInvoiceStatus` para desbloquear el botón "Emitir factura" tras anulación total.
2. Nueva RPC `create_rectificativa_substitution` + migración.
3. Nuevo hook `useFixInvoiceType` y diálogo `FixInvoiceTypeDialog`.
4. Botón "Corregir tipo de factura" en `InvoiceDetailDialog` y en la fila de la lista de facturas.
5. Modo "solo re-emitir" cuando ya existe rectificativa anulatoria previa.

Ninguna modificación a Verifactu ni a la cadena de hashes; se reutilizan `seal-invoice-verifactu` y `handle_rectificativa_payments`.
