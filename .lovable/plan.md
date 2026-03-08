

# Añadir pestaña "Autorregistros" al detalle de sesión

## Cambio

Añadir una nueva pestaña en `SessionDetailDrawer.tsx` entre "Consentimientos" y "Otras sesiones" que muestre los autorregistros del paciente asociado a la sesión.

## Modificación: `src/components/agenda/SessionDetailDrawer.tsx`

1. **Import**: Añadir `NotebookPen` de lucide-react y `PatientAutoregistros` del componente existente
2. **Nueva TabsTrigger** (después de "Consentimientos", antes de "Otras sesiones"):
   - value: `"autoregistros"`
   - Icono mobile: `NotebookPen`
   - Label desktop: `"Autorregistros"`
3. **Nuevo TabsContent** (antes del de "otras"):
   - Si hay `patient_id`: renderiza `<PatientAutoregistros patientId={session.patient_id} />`
   - Si no: mensaje "Sin paciente asignado"

Se reutiliza directamente el componente `PatientAutoregistros` ya existente, que incluye listado de entradas, gráfico y botón de envío.

