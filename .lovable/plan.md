

## Problema

La factura SP260011 (75€, status "issued") no tiene un registro en la tabla `debts`. El dashboard y la pagina de Cobros solo consultan la tabla `debts` para calcular "Pendientes Cobro". La funcion `generate-pending-debts` excluye explicitamente sesiones que ya tienen factura (lineas 84-86), asi que nunca crea deuda para sesiones facturadas.

Resultado: facturas emitidas sin cobrar no aparecen en ningun sitio como pendientes.

## Solucion

Incluir facturas emitidas sin cobrar (`status = 'issued'`) en el calculo de pendientes, tanto en el Dashboard como en la pagina de Cobros.

### 1. Dashboard (`src/pages/Dashboard.tsx`)
- Agregar una query adicional a `invoices` con `status = 'issued'` para sumar el total de facturas emitidas no cobradas
- Restar las cantidades que ya estan cubiertas por debts con `invoice_id` para evitar doble conteo
- Combinar ambas cantidades en `pendingDebts`

### 2. Pagina de Cobros - Stats (`src/hooks/useDebts.tsx` - `useDebtStats`)
- Misma logica: ademas de sumar debts pendientes, sumar facturas `issued` sin debt asociada
- Asi el resumen de cobros pendientes refleja toda la deuda real

### 3. Pagina de Cobros - Lista (`src/hooks/useDebts.tsx` o `src/pages/Payments.tsx`)
- Mostrar facturas emitidas sin debt como items cobrables en la lista de deudas
- Crear un debt automaticamente al intentar cobrar una factura sin debt, o mostrar las facturas pendientes en una seccion separada

### Enfoque preferido: Auto-crear debt al emitir factura

En lugar de parchear multiples queries, la solucion mas limpia es crear un registro `debts` automaticamente cuando se emite una factura. Asi el flujo existente (que ya funciona bien para debts) cubre todo.

#### Archivo: `src/hooks/useIssueInvoice.tsx` (o equivalente donde se emite la factura)
- Tras emitir la factura exitosamente, insertar un registro en `debts` con:
  - `invoice_id` = id de la factura
  - `patient_id` = paciente de la factura  
  - `amount` = total de la factura
  - `due_date` = fecha de emision (o configurable)

#### Archivo: `src/hooks/useCreateSignedInvoice.tsx` (si la emision se hace ahi)
- Misma logica de auto-creacion de debt

Esto garantiza que toda factura emitida aparece automaticamente en Cobros.

### Archivos a revisar/modificar
- `src/hooks/useIssueInvoice.tsx` — crear debt al emitir
- `src/hooks/useCreateSignedInvoice.tsx` — crear debt al emitir  
- `src/pages/Dashboard.tsx` — fallback: incluir facturas issued sin debt en el calculo
- No se necesitan migraciones

