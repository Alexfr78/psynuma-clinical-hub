# Facturas completas sin datos fiscales del contacto

## Resultado de la verificación

Sí: hay **93 facturas emitidas y válidas** en las series completas ordinarias (SF) de contactos con datos fiscales incompletos, entre el **8 ene 2026 y el 20 jul 2026**, de **31 contactos distintos**. Las 93 están **selladas en VeriFactu** (ya comunicadas a la AEAT), así que no se pueden editar: solo anular o rectificar.

Datos fiscales exigidos en factura completa: NIF, dirección, ciudad y código postal. Casi todas carecen de los cuatro a la vez (ninguna tiene `recipient_snapshot` guardado). Solo 3 contactos tienen NIF pero les falta la dirección completa: Iker Acuña Huici, Javier Domínguez y Marcos Moreno Ridruejo.

Contactos con más facturas afectadas: Zeus Lara (12), Arturo Jorquera (10), Fran Infante (9), Jose Vicente Pérez Hernández (7), Alberto Roig (7), Gustavo de las Heras (6), Iker Acuña Huici (6). El resto, 1-3 cada uno.

## Plan propuesto

1. **Completar los datos fiscales de los 31 contactos** (NIF, dirección, ciudad, CP) en sus fichas — es trabajo de datos que requiere la información real de cada contacto. Puedo generar un listado en CSV con lo que falta por contacto para rellenarlo.
2. **Decidir el tratamiento de las 93 facturas** (a elegir por el usuario):
   - **Opción A — No tocar nada**: la AEAT ya tiene los registros; las facturas son legalmente deficientes pero la recaudación es correcta. Riesgo solo ante una inspección.
   - **Opción B — Rectificativas selectivas**: emitir factura rectificativa solo para los contactos que la soliciten o para importes relevantes.
   - **Opción C — Rectificar todas**: 93 rectificativas + reenvío. Carga grande y visible para los contactos.
3. **Verificar que la restricción actual** de exigir datos completos al emitir serie completa funciona (comprobar que no se han emitido facturas incompletas después del 20 jul 2026 — la última afectada es SF260106).

## Detalles técnicos

- Consulta base: `invoices` ⋈ `invoice_series` (`invoice_type='complete'`, `series_type='ordinary'`) ⋈ `patients`, estado ≠ draft, `is_valid`, falta alguno de `tax_id`/`address`/`city`/`postal_code`.
- Ninguna factura afectada tiene `recipient_snapshot`; el dato que falta falta también en el PDF.
- Sin cambios de código ni de esquema en ninguna opción salvo que se elijan rectificativas (usan el flujo ya existente `create_rectificativa_substitution`).
