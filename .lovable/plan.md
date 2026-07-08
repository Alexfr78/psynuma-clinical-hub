## Diagnóstico

He comprobado abril 2026 en la base de datos:

- Sumando todas las facturas emitidas/pagadas del mes: **1550 €**.
- Con la lógica actual de la app: **1400 €**.
- La diferencia viene de que ahora se excluyen las originales marcadas como no válidas y además se siguen sumando las rectificativas negativas:
  - `SP260022` +75 € está excluida.
  - `SF260053` +75 € está excluida.
  - `RS260002` -75 € se resta.
  - `RP260002` -10 € se resta.

Por eso el total baja artificialmente. Para el indicador que estás mirando, el criterio correcto es **total bruto facturado del mes**, no saldo fiscal neto.

## Plan de cambio

1. **Actualizar el cálculo de las tarjetas superiores en `/facturas`**
   - En `useInvoiceStats`, sumar las facturas con estado `issued` o `paid` del mes.
   - No excluir por `is_valid = false`.
   - No restar rectificativas negativas del total facturado.
   - Mantener fuera solo facturas `draft` y `cancelled`.

2. **Alinear “Facturas pagadas” y “Pendiente de cobro”**
   - Aplicar el mismo criterio bruto:
     - `totalIssued`: suma de `issued` + `paid`.
     - `totalPaid`: suma de `paid`.
     - `totalPending`: suma de `issued`.
   - Así abril mostrará **1550 €** en lugar de 1400 €.

3. **Revisar el gráfico “Evolución de facturación”**
   - Ahora mismo también filtra `is_valid !== false`, por lo que puede mostrar un criterio distinto o seguir descontando importes.
   - Ajustarlo al mismo criterio bruto para que el gráfico y las tarjetas cuadren.

4. **Validación**
   - Verificar con los datos de abril que el total mostrado sea 1550 €.
   - Comprobar que el listado de facturas no cambia; solo cambia el cálculo de importes agregados.