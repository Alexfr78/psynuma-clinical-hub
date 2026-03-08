

## Plan: Feedback de registros para pacientes en autorregistros

### Concepto
Añadir un toggle por plantilla (`patient_feedback_enabled`) que, cuando está activo, muestra al paciente un resumen de sus registros anteriores en la misma página pública del formulario. Esto permite la toma de conciencia sin requerir autenticación adicional — el paciente ya tiene acceso vía token.

### Cambios

#### 1. Base de datos — Migración
Añadir columna `patient_feedback_enabled boolean DEFAULT false` a `autoregistro_templates`.

Añadir RLS policy para que `anon` pueda leer las entries del paciente a través de un token válido (necesario para mostrar el historial en la vista pública):

```sql
ALTER TABLE public.autoregistro_templates
ADD COLUMN patient_feedback_enabled boolean DEFAULT false;

-- Anon can read entries when feedback is enabled and token is valid
CREATE POLICY "Anon can read entries for feedback"
ON public.autoregistro_entries FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.autoregistro_links al
    JOIN public.autoregistro_templates at ON at.id = al.template_id
    WHERE al.access_token = public.get_autoregistro_token()
    AND al.status = 'active'
    AND al.patient_id = autoregistro_entries.patient_id
    AND al.template_id = autoregistro_entries.template_id
    AND at.patient_feedback_enabled = true
  )
);
```

#### 2. UI de configuración — `CreateTemplateDialog.tsx` y `EditTemplateDialog.tsx`
Añadir un `Switch` con label "Permitir que el paciente vea sus registros anteriores" debajo de los campos del formulario, antes del botón de submit. Bind al nuevo campo `patient_feedback_enabled`.

#### 3. Hook `useAutoregistroTemplates.tsx`
- Actualizar `AutoregistroTemplate` interface para incluir `patient_feedback_enabled: boolean`.
- Incluir el campo en `createTemplate` y `updateTemplate` mutations.

#### 4. Vista pública — `usePublicAutoregistro.tsx`
- Incluir `patient_feedback_enabled` en el select de la plantilla.
- Si `patient_feedback_enabled` es true, hacer una query adicional para obtener las entries del paciente para esa plantilla (filtrado por `patient_id` y `template_id` del link).
- Exponer `entries` y `feedbackEnabled` en el return.

#### 5. Vista pública — `AutoregistroPublic.tsx`
- Si `feedbackEnabled` es true y hay entries, mostrar debajo del formulario una sección "Mis registros anteriores" con:
  - Un gráfico de evolución reutilizando el componente `EntryChart` existente (para campos numéricos/escala).
  - Una tabla resumida con los últimos ~10 registros mostrando fecha y valores principales.
- Después de un submit exitoso, refetch de entries para que el nuevo registro aparezca inmediatamente.

#### 6. Nuevo componente — `PatientFeedbackPanel.tsx`
Componente ligero que recibe `entries` y `fields` y renderiza:
- `EntryChart` (ya existente, se reutiliza directamente).
- Una tabla simple con las últimas entradas (fecha + valores de campos numéricos/escala/select).
- Estilo read-only, limpio, sin acciones de edición/eliminación.

### Flujo del paciente

```text
Paciente abre /registro/{token}
    ↓
Se carga el link + template + entries (si feedback enabled)
    ↓
┌─────────────────────────────────┐
│  Formulario de registro         │
│  [campos dinámicos...]          │
│  [Enviar registro]              │
├─────────────────────────────────┤
│  📊 Mis registros anteriores    │  ← solo si feedback enabled
│  [Gráfico de evolución]         │
│  [Tabla con últimos registros]  │
└─────────────────────────────────┘
```

### Seguridad
- Las entries solo son legibles por `anon` cuando el token es válido, el link está activo, y la plantilla tiene `patient_feedback_enabled = true`.
- No se expone información de otros pacientes ni de otras plantillas.
- El paciente no puede modificar ni eliminar registros.

### Archivos afectados
- **Migración SQL**: nueva columna + RLS policy
- `src/hooks/useAutoregistroTemplates.tsx` — tipo + mutations
- `src/components/autoregistros/CreateTemplateDialog.tsx` — switch
- `src/components/autoregistros/EditTemplateDialog.tsx` — switch
- `src/hooks/usePublicAutoregistro.tsx` — fetch entries si feedback enabled
- `src/pages/AutoregistroPublic.tsx` — render panel de feedback
- **Nuevo**: `src/components/autoregistros/PatientFeedbackPanel.tsx`

