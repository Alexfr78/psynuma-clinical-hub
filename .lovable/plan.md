

# Borrar todos los autorregistros de un paciente

## Solución

Añadir un botón "Borrar todos" en la pestaña "Registros" que aparece cuando hay un paciente seleccionado y existen entradas. Al pulsarlo, se muestra un `AlertDialog` de confirmación y se eliminan todas las entradas de `autoregistro_entries` filtradas por `patient_id` y `center_id`.

## Cambios

### 1. `src/hooks/useAutoregistroEntries.tsx`
- Añadir una mutación `useDeleteAutoregistroEntries` (o exportar `deleteEntries` desde el hook) que ejecute `supabase.from('autoregistro_entries').delete().eq('center_id', centerId).eq('patient_id', patientId)`.
- Invalidar query `autoregistro-entries` on success.

### 2. RLS — Verificar permisos DELETE
- Revisar si la tabla `autoregistro_entries` tiene política de DELETE. Si no existe, crear una migración para permitir DELETE a usuarios del centro.

### 3. `src/pages/Autoregistros.tsx`
- Añadir estado `confirmDeleteOpen`.
- Cuando `filterPatientId !== 'all'` y hay entradas, mostrar botón "Borrar todos" (icono Trash2, variant destructive/outline) junto al Select de filtro.
- AlertDialog de confirmación con mensaje "¿Eliminar todos los registros de [nombre paciente]?" y botón destructivo.
- Al confirmar, ejecutar la mutación y mostrar toast de éxito.

### 4. `src/components/patients/tabs/PatientAutoregistros.tsx`
- Mismo botón "Borrar todos" con AlertDialog, usando el `patientId` prop directamente.

