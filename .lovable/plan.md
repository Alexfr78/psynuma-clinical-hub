## Diagnóstico

Revisé la ficha de Alejandro Macías (id `1cf0e000-…`) y la base de datos:

- En la tabla `sessions` tiene 30+ registros desde diciembre, muchos con `status = 'cancelled'` (toda la serie recurrente `a7e2156d…`, que ya está marcada `is_active = false`).
- `useSessions` (que alimenta la agenda) filtra explícitamente `.neq('status','cancelled')`, así que esas sesiones canceladas no se ven en el calendario.
- `PatientSessions.tsx` (pestaña Sesiones del contacto) **no filtra por estado**: trae todo, incluyendo las canceladas. Por eso "no se corresponden con las de la agenda".

No es que se hayan eliminado del calendario sin borrarlas de la ficha: están como `cancelled` en BD. Es un desajuste de filtro entre las dos vistas.

## Solución

Alinear la pestaña Sesiones del contacto con la agenda y dar control al usuario:

### `src/components/patients/tabs/PatientSessions.tsx`

1. Añadir un filtro de estado con tres opciones, usando `Tabs` arriba de la lista:
   - **Activas** (por defecto): excluye `cancelled` — coincide con lo que se ve en la agenda.
   - **Canceladas**: solo `cancelled`.
   - **Todas**: sin filtro.
2. Mostrar el contador de sesiones por filtro junto al título (p. ej. "Activas (12)").
3. Aplicar el filtro en cliente sobre el resultado del query (sigue trayendo todo de una vez para los contadores).
4. Ajustar el estado vacío al filtro seleccionado ("No hay sesiones activas", etc.).

No se modifica ningún dato en BD: las sesiones canceladas siguen existiendo (necesarias para histórico, facturación previa, auditoría). Simplemente la ficha deja de mezclarlas con las activas por defecto.

### Por qué no borrarlas

Borrar las `cancelled` automáticamente sería destructivo y rompería integridad con cobros/notificaciones/auditoría que pueden referenciarlas. Si quieres, en una segunda iteración puedo añadir un botón "Limpiar canceladas antiguas" con confirmación, pero lo razonable es ocultarlas por defecto.