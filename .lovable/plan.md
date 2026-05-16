## Contexto

La sesión de Prueba2 del 13/05/2026 19:00 se guardó con:
- `session_type_id = NULL`
- `price = 75 €`, `pricing_source = NULL` (el trigger no se aplicó porque exige `session_type_id`)

Estado actual en base de datos del precio personalizado de Prueba2 (`patient_custom_prices`):
- Servicio: "Sesión Clínica" (base 75 €)
- **Precio personalizado: 75 €** (no 10 €)
- Inicio: **2026-05-15** (posterior a la sesión)
- Único registro en histórico: `created` con 75 € el 2026-05-15

Es decir, en BD no hay ni rastro de una tarifa de 10 € (ni registro `updated` que la hubiera cambiado). Por eso, aunque hubiera tenido `session_type_id`, `resolve_effective_price` habría devuelto 75 € (precio base) porque la tarifa empieza dos días después.

## Cambios a implementar

### 1. Tipo de sesión obligatorio al crear

Volver `session_type_id` requerido en los tres formularios de creación:

- `src/components/agenda/CreateSessionDialog.tsx` (línea 75): cambiar `z.string().optional()` por `z.string().uuid('Selecciona un tipo de sesión')`.
- `src/components/agenda/QuickCreateSessionDialog.tsx`: aplicar la misma validación si existe el campo.
- `src/components/agenda/MobileSessionForm.tsx`: misma validación.

Añadir asterisco visible en la etiqueta del campo y mensaje de error claro. Mantener auto-selección si solo hay un tipo activo o si hay un tipo marcado como "Primera consulta" para nuevos contactos.

### 2. Corregir la tarifa de Prueba2 en BD

Actualizar el registro existente de `patient_custom_prices` para Prueba2:
- `custom_price`: 10 €
- `start_date`: fecha que el usuario indique (probablemente anterior al 13/05/2026 para que aplique a esta sesión)

### 3. Recalcular la sesión del 13/05

Una vez corregida la tarifa y asignado el `session_type_id` ("Sesión Clínica"), forzar el recálculo de esa sesión llamando a `resolve_effective_price` y actualizando `price`, `pricing_source` y `custom_price_id`. También sincronizar la deuda asociada si existe.

### 4. (Opcional) Auditoría rápida del CustomPriceDialog

Revisar `src/components/pricing/CustomPriceDialog.tsx` (líneas 128-142): cuando cambia el target, hace `form.setValue('custom_price', st.default_price)` automáticamente. Si el usuario después de seleccionar el servicio no edita el campo, se guarda el precio base. Añadir un aviso visual ("Has dejado el precio igual al base — ¿seguro?") o vaciar el campo en vez de pre-rellenar con el base, para evitar guardar tarifas "fantasma" iguales al base.

## Preguntas pendientes

- ¿Desde qué fecha quieres que la tarifa de 10 € de Prueba2 sea válida?
- ¿Quieres el cambio del punto 4 (no pre-rellenar con el precio base)?
