

## Plan: Añadir pestaña "Facturas" en el detalle de sesión

### Objetivo
Permitir consultar todas las facturas emitidas al paciente directamente desde el drawer de detalle de sesión, sin navegar a otra página.

### Cambios en `src/components/agenda/SessionDetailDrawer.tsx`

1. **Importar** `PatientInvoices` desde `@/components/patients/tabs/PatientInvoices` y `InvoiceDetailDialog` desde `@/components/invoices/InvoiceDetailDialog`. Añadir icono `Receipt` a los imports de lucide.

2. **Añadir estado** `selectedInvoiceId` para abrir el detalle de factura inline.

3. **Nueva pestaña "Facturas"** en el `TabsList` (entre "Autorregistros" y "Otras sesiones"):
   - Icono `Receipt` en móvil, texto "Facturas" en desktop.
   - Misma clase CSS que las demás pestañas.

4. **Nuevo `TabsContent`** con `value="facturas"` (entre el de autoregistros y el de otras sesiones):
   - Si hay `patient_id`: renderizar `PatientInvoices` con soporte para click en factura que abra `InvoiceDetailDialog`.
   - Si no hay paciente: mostrar placeholder como las demás pestañas.

5. **Modificar `PatientInvoices`** para aceptar un callback opcional `onInvoiceClick?(invoiceId: string)` y hacer cada Card clickable. Si no se pasa callback, mantener comportamiento actual.

6. **Añadir `InvoiceDetailDialog`** al JSX del drawer, controlado por `selectedInvoiceId`.

### Archivos afectados
- `src/components/agenda/SessionDetailDrawer.tsx` — nueva pestaña + estado + diálogo
- `src/components/patients/tabs/PatientInvoices.tsx` — añadir prop `onInvoiceClick` opcional

