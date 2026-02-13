

## Corregir integridad financiera en creacion de bonos

### Problema detectado

Al crear el bono para Jaime Pizarro (12 feb 2026), el bono se guardo correctamente en la base de datos pero **no se creo el registro de deuda** asociado. Sin deuda, tampoco se registro el pago. Esto provoca que:

1. El detalle de sesion muestre "Cubierto por bono" (porque el bono esta aplicado a la sesion)
2. El historial de cobros NO muestre ningun pago por la compra del bono

### Causa raiz

En `CreateBonoDialog.tsx`, la creacion del bono y la creacion de la deuda son operaciones separadas (no transaccionales). Si la insercion de la deuda falla despues de que el bono ya ha sido guardado, el bono queda en la base de datos sin su registro financiero. El error se captura en un `catch` generico que muestra un toast, pero el bono ya esta persistido.

### Solucion

#### 1. Reparar los datos existentes (migracion SQL)

Crear una migracion que detecte bonos con `total_price > 0` que no tengan deuda asociada e inserte el registro de deuda faltante:

```sql
INSERT INTO debts (patient_id, bono_id, amount, paid_amount, status, notes, center_id)
SELECT b.patient_id, b.id, b.total_price, 0, 'pending',
       'Bono: ' || b.name || ' (' || b.total_sessions || ' sesiones)',
       b.center_id
FROM bonos b
WHERE b.total_price > 0
  AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.bono_id = b.id)
  AND b.status != 'cancelled';
```

#### 2. Crear RPC transaccional para creacion de bonos (`create_bono_with_debt`)

Crear una funcion SQL que agrupe la creacion del bono y la deuda en una sola transaccion, garantizando que ambos se crean o ninguno:

- Recibe los parametros del bono (patient_id, name, total_sessions, price_per_session, total_price, expires_at, center_id)
- Inserta el bono
- Inserta la deuda vinculada
- Retorna el ID del bono y el ID de la deuda
- Si cualquiera falla, ambos se revierten

#### 3. Actualizar `CreateBonoDialog.tsx`

- Reemplazar la creacion manual del bono + deuda (lineas 180-208) por una llamada al RPC `create_bono_with_debt`
- Mantener la logica posterior de facturacion y pago sin cambios
- Usar el `debt_id` retornado por el RPC para las operaciones de pago/factura

#### 4. Actualizar `useBonos.tsx`

- Anadir una nueva funcion `useCreateBonoWithDebt` que llame al RPC
- O modificar `useCreateBono` para usar el RPC

### Archivos a modificar

- **Migracion SQL** - Reparar datos existentes y crear funcion RPC `create_bono_with_debt`
- `src/components/bonos/CreateBonoDialog.tsx` - Usar RPC transaccional en lugar de inserciones separadas
- `src/hooks/useBonos.tsx` - Actualizar o anadir hook para el nuevo RPC

### Resultado esperado

- Los bonos siempre se crean con su deuda asociada (operacion atomica)
- El bono de Jaime Pizarro tendra su deuda pendiente visible en "Deudas pendientes"
- Cuando se registre el pago del bono, aparecera en el historial de cobros
- No se podran crear bonos "huerfanos" sin registro financiero

