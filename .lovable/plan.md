## Objetivo

Mejorar la pestaña **Autorregistros** dentro de la ficha de contacto (`/pacientes/:id`) para poder consultar de forma completa los autorregistros enviados al contacto y todas sus respuestas.

## Cambios

### 1. Sub-pestañas internas en `PatientAutoregistros`
Reorganizar la pestaña en tres vistas con un `Tabs` interno:

- **Respuestas** (por defecto) — tabla/cards actuales de entries con detalle al hacer clic.
- **Enlaces enviados** — listado de `autoregistro_links` del contacto con estado (activo / expirado), plantilla, fecha de envío, fecha de expiración, nº de respuestas recibidas. Acciones: copiar enlace, reenviar por WhatsApp, desactivar, eliminar.
- **Evolución** — gráficas (`EntryChart`) con selector de plantilla cuando hay varias.

### 2. Filtro por plantilla
Cuando el contacto tiene respuestas de más de una plantilla:
- Añadir un `Select` "Plantilla" arriba de las sub-pestañas Respuestas y Evolución.
- Opción "Todas" para mantener la vista combinada actual.
- Al filtrar, las columnas dinámicas se construyen a partir de los campos de la plantilla seleccionada y las gráficas se filtran al subconjunto correspondiente.

### 3. Visualización de respuestas mejorada
- En la sub-pestaña **Respuestas**, añadir columna "Plantilla" y "Fecha" (cuando hay varias plantillas o cuando "Todas" está seleccionado).
- En `EntryDetailDialog`: si el campo tiene `type === 'number' | 'scale'` y hay ≥2 entries de la misma plantilla, mostrar un mini-sparkline con la evolución histórica de ese campo concreto para este contacto.
- En la sub-pestaña **Evolución**: una `EntryChart` por cada campo numérico/escala (en lugar de todos los campos juntos), para que cada métrica tenga su propia escala Y y sea legible. Mantener `showInChart` para excluir campos.

### 4. Sub-pestaña "Enlaces enviados"
Tabla/cards con:
- Plantilla · Fecha de envío · Expira · Estado (badge) · Nº respuestas · Acciones.

Acciones por fila:
- **Copiar enlace público** (`{APP_BASE_URL}/registro/{access_token}`)
- **Reenviar por WhatsApp** (abrir `SendAutoregistroDialog` precargado con plantilla y contacto)
- **Desactivar** (usar `deactivateLink` existente)
- **Eliminar** (usar `deleteLink` existente, con confirmación)

El conteo de respuestas por enlace se calcula en cliente agrupando `entries` por `link_id`.

## Archivos afectados (solo frontend)

- `src/components/patients/tabs/PatientAutoregistros.tsx` — refactor a sub-pestañas + filtro de plantilla + sub-vista de enlaces.
- `src/components/autoregistros/PatientLinksList.tsx` — **nuevo**: lista de enlaces enviados con acciones.
- `src/components/autoregistros/EntryDetailDialog.tsx` — añadir mini-sparkline por campo numérico.
- `src/components/autoregistros/EntryChart.tsx` — soportar opción "una gráfica por campo".

Sin cambios de base de datos ni edge functions: toda la información ya está disponible vía `useAutoregistroEntries` y `useAutoregistroLinks`.
