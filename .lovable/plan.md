

# Registros en formato tabla

## Cambio

Reemplazar las tarjetas (`EntryCard`) por una tabla en la pestaña "Registros" de la página principal de Autorregistros y en `PatientAutoregistros`.

## Modificaciones

### 1. `src/pages/Autoregistros.tsx`
- Reemplazar el mapeo de `EntryCard` por un componente `Table` con columnas: Paciente, Plantilla, Fecha, Campos, y acción de ver detalle
- Importar `Table, TableHeader, TableBody, TableRow, TableHead, TableCell` de `@/components/ui/table`
- Cada fila clickeable abre el `EntryDetailDialog` igual que antes

### 2. `src/components/patients/tabs/PatientAutoregistros.tsx`
- Mismo cambio: reemplazar `EntryCard` por tabla (sin columna "Paciente" ya que es contexto de un solo paciente)
- Columnas: Plantilla, Fecha, Campos, acción

### 3. `src/components/autoregistros/EntryCard.tsx`
- Se mantiene el archivo por si se usa en otros contextos, pero ya no se importará desde las dos vistas principales

