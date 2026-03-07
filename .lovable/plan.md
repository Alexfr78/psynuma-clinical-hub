

## Plan: Corregir envío Verifactu SP260013 y mejorar gestión de errores permanentes

### Causa raíz
El NIF `05250396V` del paciente Gonzalo de Porras tiene la letra de control incorrecta. AEAT lo rechaza con error 1239 en cada intento. El sistema de reintentos no diferencia errores de datos (permanentes) de errores transitorios del servidor.

### Acciones

#### 1. Corregir el dato del paciente
- Actualizar el NIF del paciente en la base de datos (el usuario debe verificar cuál es el NIF correcto real).
- Resetear `verifactu_pending` y `verifactu_retry_count` de la factura SP260013 para permitir un nuevo intento limpio.

#### 2. Añadir validación de NIF español en el frontend
- En `CreatePatientDialog` y `PatientData`, validar el formato del NIF/NIE antes de guardar:
  - NIF: 8 dígitos + letra de control correcta
  - NIE: X/Y/Z + 7 dígitos + letra de control
- Mostrar aviso si la letra no coincide.

#### 3. Mejorar `retry-pending-verifactu` para detectar errores permanentes
- Tras recibir respuesta de AEAT, parsear el `CodigoErrorRegistro`.
- Si el código es de la familia de errores de datos (1239, 1240, etc.), marcar la factura como `verifactu_pending = false` y `verifactu_error_permanent = true` inmediatamente, sin más reintentos.
- Solo reintentar errores transitorios (timeouts, errores 5xx, error 103 de servidor).

#### 4. Mostrar error claro en el detalle de factura
- Cuando una factura tiene un error permanente de Verifactu, mostrar el mensaje de error de AEAT en el diálogo de detalle con instrucciones claras (ej: "Corrija el NIF del paciente y reintente").

### Archivos afectados
- `supabase/functions/retry-pending-verifactu/index.ts` — clasificar errores permanentes vs transitorios
- `supabase/functions/sign-invoice-verifactu/index.ts` — añadir validación de NIF antes de enviar
- `src/components/patients/CreatePatientDialog.tsx` — validación de NIF en frontend
- `src/components/patients/tabs/PatientData.tsx` — validación de NIF en edición
- `src/components/invoices/InvoiceDetailDialog.tsx` — mostrar error permanente de Verifactu
- Migración SQL: resetear la factura SP260013 tras corrección del NIF

### Sin nuevas tablas
Se reutiliza el campo existente `verifactu_retry_count` y se añade lógica de clasificación de errores.

