

# Módulo "Autorregistros" - Plan de implementación

## Resumen

Nuevo módulo clínico que permite a terapeutas crear plantillas de formularios dinámicos, enviarlos a pacientes via enlace público, y visualizar los registros completados. Sigue los mismos patrones que el módulo de Consentimientos/Evaluaciones existente.

---

## 1. Base de datos (4 tablas + RLS)

```sql
-- Plantillas de autorregistro
CREATE TABLE autoregistro_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  professional_id uuid NOT NULL REFERENCES profiles(id),
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]',  -- Array de {label, type, options?, required, order}
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enlaces enviados a pacientes
CREATE TABLE autoregistro_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id),
  template_id uuid NOT NULL REFERENCES autoregistro_templates(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  professional_id uuid NOT NULL REFERENCES profiles(id),
  access_token text NOT NULL DEFAULT gen_random_uuid()::text,
  status text NOT NULL DEFAULT 'active',  -- active, expired, completed
  allow_multiple boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Entradas completadas por pacientes
CREATE TABLE autoregistro_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES autoregistro_links(id),
  center_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  template_id uuid NOT NULL,
  values jsonb NOT NULL DEFAULT '{}',  -- {field_label: value, ...}
  submitted_at timestamptz DEFAULT now()
);

-- RLS en las 3 tablas: center_id = get_user_center_id(auth.uid())
-- + Política anon INSERT en entries via access_token
-- + Política anon SELECT en templates/links via access_token
```

Los campos se almacenan como JSONB en `autoregistro_templates.fields` (no tabla separada) para simplicidad y flexibilidad. Cada campo: `{label, type, options?, required, order}`. Tipos soportados: `text`, `textarea`, `number`, `date`, `time`, `select`, `checkbox`, `scale`.

---

## 2. Archivos nuevos a crear

### Hooks
- **`src/hooks/useAutoregistroTemplates.tsx`** — CRUD plantillas (query + mutations)
- **`src/hooks/useAutoregistroLinks.tsx`** — CRUD enlaces (query + mutations, generar token)
- **`src/hooks/useAutoregistroEntries.tsx`** — Lectura de entradas por paciente/plantilla
- **`src/hooks/usePublicAutoregistro.tsx`** — Hook público (cargar formulario por token, submit sin auth)

### Páginas
- **`src/pages/Autoregistros.tsx`** — Página principal con 3 tabs: Plantillas, Envíos, Registros
- **`src/pages/AutoregistroPublic.tsx`** — Formulario público en `/registro/{token}`

### Componentes
- **`src/components/autoregistros/CreateTemplateDialog.tsx`** — Dialog con constructor de campos dinámico
- **`src/components/autoregistros/TemplateCard.tsx`** — Card para listar plantillas
- **`src/components/autoregistros/FieldBuilder.tsx`** — Constructor visual de campos (add/remove/reorder/configure)
- **`src/components/autoregistros/SendAutoregistroDialog.tsx`** — Seleccionar paciente + plantilla, generar enlace
- **`src/components/autoregistros/LinkCard.tsx`** — Card para envíos activos
- **`src/components/autoregistros/EntryCard.tsx`** — Card para entradas completadas
- **`src/components/autoregistros/EntryDetailDialog.tsx`** — Ver detalle de una entrada
- **`src/components/autoregistros/DynamicFormRenderer.tsx`** — Renderiza formulario dinámico a partir de fields JSONB
- **`src/components/autoregistros/EntryChart.tsx`** — Gráfico temporal para campos numéricos/escala (recharts)
- **`src/components/patients/tabs/PatientAutoregistros.tsx`** — Tab en ficha de paciente

---

## 3. Archivos existentes a modificar

| Archivo | Cambio |
|---------|--------|
| `src/App.tsx` | Añadir ruta `/autorregistros` (protegida) y `/registro/:token` (pública) |
| `src/components/layout/AppSidebar.tsx` | Añadir "Autorregistros" al menú principal (icon: `ClipboardList` o `NotebookPen`) |
| `src/components/patients/PatientDetailTabs.tsx` | Añadir tab "Autorregistros" con `PatientAutoregistros` |

---

## 4. Constructor de formularios (FieldBuilder)

Interfaz con cards reordenables. Cada campo tiene:
- Input para `label`
- Select para `type` (text/textarea/number/date/time/select/checkbox/scale)
- Input condicional para `options` (solo si type=select, separadas por coma)
- Switch para `required`
- Botones mover arriba/abajo + eliminar

Botón "Añadir campo" al final. Sin drag & drop externo — reorder con flechas para simplicidad.

---

## 5. Formulario público (DynamicFormRenderer)

Renderiza cada campo según su `type`:
- `text` → `<Input />`
- `textarea` → `<Textarea />`
- `number` → `<Input type="number" />`
- `date` → `<Input type="date" />`
- `time` → `<Input type="time" />`
- `select` → `<Select />` con opciones del campo
- `checkbox` → `<Checkbox />`
- `scale` → `<Slider />` 0-10 con labels

Diseño mobile-first, limpio, con validación de campos obligatorios.

---

## 6. Visualización de registros

- Filtros por paciente y plantilla
- Listado cronológico de entradas
- Para campos numéricos/scale: gráfico de línea temporal con recharts
- Dialog de detalle mostrando todos los valores de una entrada

---

## 7. Seguridad

- RLS en todas las tablas con `center_id = get_user_center_id(auth.uid())`
- Acceso público al formulario via `access_token` en `autoregistro_links` (sin auth)
- Política anon para INSERT en entries y SELECT en templates/links validando token
- Función SQL `get_autoregistro_token()` similar al patrón existente de `get_consent_token()`
- `verify_jwt = false` en config.toml NO necesario (se usa cliente anon directamente con RLS)

