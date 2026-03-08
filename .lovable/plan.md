

# Facturas en el Portal del Paciente

## Resumen

Añadir una pestaña "Facturas" al portal del paciente donde pueda ver y descargar todas sus facturas emitidas. Se necesita una edge function nueva para servir los datos con el mismo patrón de autenticación por token HMAC que usa el portal.

## Cambios

### 1. Edge Function: `patient-portal-invoices`
Nueva función que:
- Valida el `sessionToken` HMAC (misma lógica que `patient-portal-sessions`)
- Acción `list`: devuelve facturas del paciente con `status != 'draft'` y `is_valid = true`, incluyendo datos del centro para descarga
- Acción `download`: genera el PDF de una factura verificando que pertenece al paciente (reutiliza lógica de `generate-invoice-pdf` o invoca la función existente)

### 2. Componente: `src/components/portal/PortalInvoices.tsx`
- Lista de facturas con número, fecha, importe, estado y badge
- Botón de descarga PDF por factura (invoca la edge function con acción `download`)
- Botón para ver factura online (abre `/factura/{access_token}` en nueva pestaña)
- Estado vacío cuando no hay facturas
- Mobile-first

### 3. Hook: `src/hooks/usePortalInvoices.tsx`
- `fetchInvoices(sessionToken)` — llama a la edge function
- Estado de carga y datos

### 4. Modificar: `src/pages/PatientPortalDashboard.tsx`
- Añadir tab "Facturas" con icono `FileText`
- Grid de tabs pasa de 3 a 4 columnas
- Conectar con `PortalInvoices`

### 5. Modificar: `src/hooks/usePatientPortal.tsx`
- Añadir `fetchInvoices` y estado de facturas al hook, o dejar el hook de invoices independiente

## Seguridad
- La edge function usa `SUPABASE_SERVICE_ROLE_KEY` para queries, validando el token HMAC del paciente
- Solo se devuelven facturas con `status` distinto de `draft` (no borradores)
- La descarga de PDF verifica que la factura pertenece al `patient_id` del token

