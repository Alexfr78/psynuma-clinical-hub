

# Mostrar respuestas de campos en la tabla de Registros

## Problema
La tabla actual muestra metadatos (paciente, plantilla, fecha, conteo de campos) en vez de las respuestas reales del paciente.

## Solución
Reemplazar las columnas actuales por columnas dinámicas basadas en los campos de la plantilla. Cada campo del template se convierte en una columna de la tabla mostrando directamente el valor respondido.

## Modificaciones

### `src/pages/Autoregistros.tsx` — Pestaña "Registros"

1. Mantener columnas fijas: **Paciente**, **Fecha**
2. Generar columnas dinámicas a partir de los campos del template (usando `entries[0].template.fields` ordenados por `order`)
3. Para cada entrada, mostrar el valor de `entry.values[field.label]` en la celda correspondiente
4. Formateo especial por tipo de campo:
   - `checkbox` → "Sí" / "No"
   - `scale` → valor + "/10"
   - resto → valor directo
5. Mantener fila clickeable para abrir `EntryDetailDialog`
6. Scroll horizontal si hay muchos campos

### `src/components/patients/tabs/PatientAutoregistros.tsx`

Mismo cambio pero sin columna "Paciente" (ya está filtrado por paciente). Columnas: **Fecha** + campos dinámicos del template.

> Nota: cuando hay entradas de distintas plantillas mezcladas (sin filtro de paciente), se usarán los campos de la primera entrada como referencia. Los valores de plantillas distintas que no coincidan se mostrarán como "—".

