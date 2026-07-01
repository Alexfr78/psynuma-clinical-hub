
## Diagnóstico

**Sesiones (8):**
| Sesión | Estado | Precio | payment_status | Factura | Deuda |
|---|---|---|---|---|---|
| 2bd2bd02 | completed | 0 € | pending | — | — (ok) |
| 7a2e74e4 (22-jun) | completed | 75 | **pending ✗** | SP260038 paid | paid |
| 6b054bc3 (10-jun) | completed | 75 | **pending ✗** | SP260037 paid | paid |
| c3a61291 (4-jun) | completed | 75 | **pending ✗** | SP260035 paid | paid |
| 82a9d9f6 (2-mar) | completed | 75 | paid | SP260013 paid (+ SP260011 anulada) | paid |
| 0a93374f (30-jun) | confirmed | 75 | pending | SP260041 emitida | **2 deudas duplicadas** |
| ff945d0c | confirmed | 75 | pending | — | pending |
| 5dc7d192 | confirmed | 75 | pending | — | pending |

**Problemas detectados:**

1. **Desincronización `sessions.payment_status`** — tres sesiones (7a2e74e4, 6b054bc3, c3a61291) tienen su factura y su deuda marcadas como `paid`, pero la sesión sigue en `pending`. Por eso "no cuadra": Cobros/agenda las siguen mostrando como pendientes aunque ya están cobradas.

2. **Deuda duplicada en sesión 0a93374f (30-jun)** — hay dos filas en `debts` para la misma sesión:
   - `f364eaa8` creada 7-abr por el cron automático (sin factura, pending)
   - `61e91d6c` creada 30-jun al emitir la factura SP260041 (vinculada a factura, pending)
   Se contabiliza la deuda dos veces (150 € en lugar de 75 €).

## Plan de corrección

### 1. Sincronizar `sessions.payment_status`
Actualizar a `paid` las tres sesiones cuya factura/deuda ya están cobradas:
- `7a2e74e4-da68-4063-ae5f-204c2f65bcf7`
- `6b054bc3-561e-40a5-bd2f-66c10ad81809`
- `c3a61291-3b2c-4790-a3f7-cf8e12312e6f`

### 2. Eliminar deuda duplicada de la sesión 0a93374f
Borrar la deuda huérfana `f364eaa8-24ec-48b5-8f8a-f8f203598a67` (la creada por el cron sin factura). La deuda `61e91d6c` vinculada a SP260041 queda como única representación válida.

### 3. Verificación post-fix
Volver a listar sesiones + deudas + facturas para confirmar:
- Deuda pendiente total = 75 (SP260041) + 75 (ff945d0c) + 75 (5dc7d192) = **225 €**
- Sesiones completadas y cobradas coherentes con facturas.

### Notas técnicas
- Se hará vía migración (UPDATE + DELETE), ya que `psql` en este entorno es solo lectura/insert.
- No se toca ninguna factura emitida (protegidas por `protect_issued_invoices`).
- No se altera la sesión 82a9d9f6 ni la factura anulada SP260011 (situación válida: reemisión).

### Fuera de alcance (a decidir aparte)
Las dos sesiones futuras/confirmadas (`ff945d0c`, `5dc7d192`) tienen deuda ya generada por el cron aunque aún no se hayan completado. Si prefieres que no se generen deudas hasta que la sesión esté `completed`, sería un cambio en el cron `generate_daily_debts` — dímelo y lo abordamos en un plan separado.
