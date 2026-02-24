
## Envío automático de consentimientos y evaluaciones por WhatsApp

### Problema actual
- **Consentimientos (`SendConsentDialog`)**: Ya usa `useWhatsAppDelivery` correctamente para enviar por WhatsApp (automatico o manual). No se toca.
- **Evaluaciones (`SendAssessmentDialog`)**: Cuando se selecciona "WhatsApp", solo actualiza el campo `sent_via` en la base de datos pero **no envía el mensaje realmente**. No usa `useWhatsAppDelivery`.
- **Crear evaluacion (`CreateAssessmentDialog`)**: Igual, si se selecciona WhatsApp al crear, solo guarda el registro pero no envía nada.

### Cambios propuestos

Solo se modifican los dos diálogos de evaluaciones. No se tocan los consentimientos ni otras configuraciones.

#### 1. `SendAssessmentDialog` - Rediseñar para usar `useWhatsAppDelivery`

Reemplazar el diálogo actual (que solo guarda en DB) por uno similar al `SendConsentDialog`:
- Mostrar el enlace de la evaluacion con boton de copiar
- Boton de WhatsApp que use `useWhatsAppDelivery` (automatico/manual segun configuracion del centro)
- Badge mostrando el metodo actual (Auto/Manual)
- Boton de copiar mensaje completo
- Vista previa del mensaje
- Integrar `WhatsAppLinkDialog` para el fallback manual
- Actualizar `sent_via`, `sent_to` y `sent_at` en la DB tras envio exitoso

#### 2. `CreateAssessmentDialog` - Envio automatico tras crear

Cuando se selecciona "WhatsApp" como canal al crear la evaluacion:
- Tras crear la evaluacion en DB, invocar `sendWhatsApp` de `useWhatsAppDelivery` con el enlace generado
- Si el envio es automatico (WasenderAPI/Meta), se completa sin interaccion adicional
- Si es manual, abrir `WhatsAppLinkDialog` con el enlace
- Actualizar los campos `sent_via`/`sent_to`/`sent_at` despues del envio

### Detalle tecnico

**Mensaje de evaluacion (template):**
```
Hola {nombre}, te envío el siguiente cuestionario para que lo completes cuando puedas:

{enlace_evaluacion}

Si tienes cualquier duda, no dudes en consultarme.
```

**Archivos modificados:**
1. `src/components/assessments/SendAssessmentDialog.tsx` - Rediseñar usando `useWhatsAppDelivery` y `WhatsAppLinkDialog`
2. `src/components/assessments/CreateAssessmentDialog.tsx` - Añadir envio real por WhatsApp tras creacion
3. `src/hooks/useAssessments.tsx` - Actualizar `resendAssessment` para recibir el resultado del envio real

**Archivos NO modificados:**
- `SendConsentDialog.tsx` (ya funciona correctamente)
- `useWhatsAppDelivery.tsx` (se reutiliza tal cual)
- Ningun otro dialogo o configuracion de envio
