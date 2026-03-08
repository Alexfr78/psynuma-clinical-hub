

## Plan: Descargar consentimiento informado en PDF

El sistema ya tiene la infraestructura de generación de PDF (`generate-consent-pdf` edge function) pero el botón de descarga solo aparece para consentimientos firmados que ya tienen `signed_pdf_url`. Vamos a añadir la posibilidad de generar y descargar el PDF bajo demanda desde cualquier estado.

### Cambios

1. **`src/components/consents/ConsentCard.tsx`**
   - Añadir opción "Descargar PDF" en el dropdown para **todos los estados** (no solo firmados con URL existente)
   - Al hacer clic, llamar a `generate-consent-pdf` edge function, obtener la URL y abrir en nueva pestaña
   - Mostrar estado de carga durante la generación

2. **`src/components/consents/ConsentDetailDialog.tsx`**
   - Añadir botón "Descargar PDF" para todos los estados (no solo cuando `signed_pdf_url` existe)
   - Misma lógica: invocar edge function → obtener URL → abrir/descargar

3. **Lógica compartida**: Crear una función helper reutilizable (o inline en ambos componentes) que:
   - Si `signed_pdf_url` existe, abre directamente esa URL
   - Si no, invoca `generate-consent-pdf`, espera la respuesta con la URL, y la abre

### Detalle técnico
- La edge function ya soporta generar PDFs para cualquier consentimiento (firmado o no), almacena el archivo en storage y devuelve `{ url }` en la respuesta
- Se usa `supabase.functions.invoke('generate-consent-pdf', { body: { consent_id } })` para la generación bajo demanda
- Se añade un estado `generatingPdf` para mostrar spinner mientras se genera

