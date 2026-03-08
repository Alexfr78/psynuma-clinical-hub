

# Añadir filtro por paciente en la pestaña "Registros"

## Problema

La pestaña "Registros" de la página principal muestra todas las entradas mezcladas sin filtrar por paciente. Dado que cada autorregistro se envía a un paciente específico, los datos (y especialmente el gráfico de evolución) no tienen sentido mezclados.

## Solución

Añadir un `Select` de filtro por paciente en la pestaña "Registros". Al seleccionar un paciente, se filtran las entradas y el gráfico muestra solo su evolución.

## Modificación: `src/pages/Autoregistros.tsx`

1. Añadir estado `filterPatientId` (string, por defecto vacío = todos)
2. Importar `usePatients` para obtener la lista de pacientes
3. Antes de la tabla, renderizar un `Select` con opción "Todos los pacientes" + lista de pacientes
4. Pasar `{ patientId: filterPatientId || undefined }` a `useAutoregistroEntries()`
5. Cuando hay filtro activo, el gráfico y la tabla muestran solo datos de ese paciente

Esto corrige que el gráfico de evolución (`EntryChart`) mezcle datos de distintos pacientes, lo cual no tiene valor clínico.

