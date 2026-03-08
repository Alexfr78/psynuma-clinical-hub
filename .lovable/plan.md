

## Plan: Hacer todos los diálogos responsivos para móviles

### Análisis realizado

He revisado los 41 archivos de diálogo del proyecto. Solo **6** usan el patrón responsivo (Dialog en desktop + Drawer en móvil):

- `CreateBonoDialog` ✅
- `SendInvoiceDialog` ✅
- `WhatsAppLinkDialog` ✅
- `CollectSessionPaymentDialog` ✅
- `CollectBonoPaymentDialog` ✅
- `CreateSessionInvoiceDialog` ✅
- `SessionDetailDrawer` ✅

### Diálogos que necesitan convertirse (29 diálogos principales)

Los AlertDialog de confirmación (eliminar pago, cancelar cita, etc.) son pequeños y funcionan aceptablemente en móvil, así que los excluyo. Me centro en los diálogos con formularios o contenido extenso:

**Prioridad Alta** (formularios complejos, uso frecuente):
1. `CreateSessionDialog` — Crear sesión
2. `QuickCreateSessionDialog` — Reserva rápida
3. `CreatePatientDialog` — Crear contacto
4. `QuickCreatePatientDialog` — Crear contacto rápido
5. `CreateSimpleInvoiceDialog` — Crear factura
6. `CreateRectificativaDialog` — Factura rectificativa
7. `RecordPaymentDialog` — Registrar pago
8. `EditPaymentDialog` — Editar pago

**Prioridad Media** (detalle/consulta con scroll):
9. `InvoiceDetailDialog` — Detalle de factura
10. `BonoDetailDialog` — Detalle de bono
11. `SessionDetailDialog` — Detalle de sesión (simple)
12. `ConsentDetailDialog` — Detalle de consentimiento
13. `AssessmentDetailDialog` — Detalle de evaluación
14. `ProfessionalDetailDialog` — Detalle de profesional
15. `IntakeRequestDetailDialog` — Detalle solicitud intake

**Prioridad Normal** (uso menos frecuente):
16. `CreateAssessmentDialog` — Crear evaluación
17. `SendAssessmentDialog` — Enviar evaluación
18. `AddTemplateDialog` — Añadir plantilla evaluación
19. `CreateConsentDialog` — Crear consentimiento
20. `CreateTemplateDialog` — Crear plantilla consentimiento
21. `SendConsentDialog` — Enviar consentimiento
22. `ExportInvoicesDialog` — Exportar facturas
23. `LinkPaymentsToInvoiceDialog` — Vincular pagos a factura
24. `LinkPaymentToInvoiceDialog` — Vincular pago individual
25. `SendPaymentReminderDialog` — Recordatorio de pago
26. `ConvertCalendarEventDialog` — Convertir evento
27. `MoveSessionDialog` — Mover sesión
28. `BonoTemplatesDialog` — Plantillas de bonos
29. `EditLocationsDialog` / `CreateSeriesDialog` — Config

**Páginas con diálogos inline** (Audit detail dialog):
30. `Audit.tsx` — Detalle de evento

### Patrón de conversión

Cada diálogo se convierte siguiendo el patrón ya establecido:

```typescript
import { useIsMobile } from '@/hooks/use-mobile';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from '@/components/ui/drawer';

// Extraer contenido a variable compartida
const content = (...);
const footer = (...);

if (isMobile) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>...</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-4 overflow-y-auto">{content}</div>
        <DrawerFooter>{footer}</DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>...</DialogContent>
  </Dialog>
);
```

Para diálogos con formularios extensos, se usa `h-[95vh]` con scroll interno en lugar de `max-h-[90vh]`.

### Archivos a modificar (29 archivos)

| Archivo | Tipo |
|---|---|
| `src/components/agenda/CreateSessionDialog.tsx` | Formulario complejo |
| `src/components/agenda/QuickCreateSessionDialog.tsx` | Formulario complejo |
| `src/components/agenda/SessionDetailDialog.tsx` | Detalle |
| `src/components/agenda/ConvertCalendarEventDialog.tsx` | Formulario |
| `src/components/agenda/MoveSessionDialog.tsx` | Formulario |
| `src/components/patients/CreatePatientDialog.tsx` | Formulario complejo |
| `src/components/patients/QuickCreatePatientDialog.tsx` | Formulario |
| `src/components/invoices/InvoiceDetailDialog.tsx` | Detalle extenso |
| `src/components/invoices/CreateSimpleInvoiceDialog.tsx` | Formulario |
| `src/components/invoices/CreateRectificativaDialog.tsx` | Formulario |
| `src/components/invoices/ExportInvoicesDialog.tsx` | Formulario |
| `src/components/invoices/LinkPaymentsToInvoiceDialog.tsx` | Lista |
| `src/components/invoices/CreateRecapInvoiceDialog.tsx` | Formulario |
| `src/components/payments/RecordPaymentDialog.tsx` | Formulario |
| `src/components/payments/EditPaymentDialog.tsx` | Formulario |
| `src/components/payments/SendPaymentReminderDialog.tsx` | Formulario |
| `src/components/payments/LinkPaymentToInvoiceDialog.tsx` | Lista |
| `src/components/bonos/BonoDetailDialog.tsx` | Detalle |
| `src/components/bonos/BonoTemplatesDialog.tsx` | Lista |
| `src/components/consents/ConsentDetailDialog.tsx` | Detalle |
| `src/components/consents/CreateConsentDialog.tsx` | Formulario |
| `src/components/consents/CreateTemplateDialog.tsx` | Formulario |
| `src/components/consents/SendConsentDialog.tsx` | Formulario |
| `src/components/assessments/CreateAssessmentDialog.tsx` | Formulario |
| `src/components/assessments/SendAssessmentDialog.tsx` | Formulario |
| `src/components/assessments/AddTemplateDialog.tsx` | Lista |
| `src/components/assessments/AssessmentDetailDialog.tsx` | Detalle |
| `src/components/professionals/ProfessionalDetailDialog.tsx` | Detalle |
| `src/components/intake/IntakeRequestDetailDialog.tsx` | Detalle |
| `src/components/settings/EditLocationsDialog.tsx` | Formulario |
| `src/components/settings/CreateSeriesDialog.tsx` | Formulario |
| `src/pages/Audit.tsx` | Detalle inline |

### Estrategia de implementación

Dado el volumen (29+ archivos), se implementarán en lotes paralelos para maximizar eficiencia. El cambio es mecánico y repetitivo: extraer contenido, añadir import de Drawer + useIsMobile, y bifurcar el render.

