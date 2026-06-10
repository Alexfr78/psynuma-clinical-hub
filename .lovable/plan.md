## Problema

En la ficha de contacto, al editar la fecha/hora de una sesión y aceptar el aviso de conflicto:

1. La interfaz queda bloqueada (no se puede hacer nada hasta refrescar).
2. El cambio de fecha/hora no se aplica a la sesión.

## Causa

1. **Bloqueo de interacción:** El `SessionDetailDrawer` se renderiza como `Sheet` (Radix Dialog) en desktop. El `ConflictsDialog` que confirma el solapamiento es **otro Radix Dialog** apilado encima. Cuando el segundo Dialog se cierra mientras el Sheet sigue abierto, Radix deja `pointer-events: none` colgando en `<body>` (conflicto de limpieza entre dos overlays modales hermanos). El parche con `setTimeout` no es suficiente porque Radix vuelve a aplicar el estilo en el ciclo siguiente.

2. **Cambio no aplicado:** Hay que confirmar si el RPC `update_session_datetime_force` realmente devuelve la fila actualizada o un `null` silencioso (sin error). Hoy el cliente no inspecciona el valor devuelto ni registra el resultado, por lo que un fallo silencioso (por ejemplo trigger bloqueando pese al GUC) pasa desapercibido y muestra el toast de éxito.

## Plan

### 1. Eliminar el Dialog anidado de conflictos en la edición desde la ficha

Sustituir el uso de `<ConflictsDialog>` dentro de `SessionDetailDrawer` por una **confirmación inline** integrada en el bloque de edición de fecha/hora del propio Sheet/Drawer:

- Cuando `handleDateTimeSave` detecte conflictos, en vez de abrir un Dialog, mostrar un panel ámbar dentro de la sección "Editando fecha y hora" con:
  - Mensaje "Esta cita se solapa con otra del profesional el …"
  - Lista resumida de las citas en conflicto.
  - Botones `Cancelar` (vuelve al estado de edición normal) y `Guardar igualmente` (llama a `executeDateTimeSave(true)`).
- Eliminar `<ConflictsDialog>` y los estados `conflictsDialogOpen` y handlers `handleConflictForceCreate` / `handleConflictCancel` asociados, y la utilidad `restoreBodyPointerEvents` añadida en el intento anterior.
- Esto elimina por completo el apilado de dos modales Radix y por tanto el bloqueo de `pointer-events` en `<body>`.

El `ConflictsDialog` se mantiene tal cual para los flujos donde es seguro (creación de sesión, drag-and-drop en agenda), ya que ahí no hay un Sheet padre abierto.

### 2. Hacer robusto el guardado forzado y diagnosticar el fallo

En `executeDateTimeSave(force=true)`:

- Cambiar la llamada para capturar también `data`: `const { data, error } = await supabase.rpc('update_session_datetime_force', {...})`.
- Si `error` o `data` es `null`/vacío, lanzar un error con un mensaje claro ("No se pudo actualizar la sesión") en vez de mostrar el toast de éxito.
- Loggear `data` en consola para ver en una próxima reproducción si el RPC devuelve la fila esperada con la nueva fecha.
- Tras éxito, además de `setLocalDateTime(...)`, llamar también a `queryClient.invalidateQueries({ queryKey: ['sessions'] })` (ya existe) y a `queryClient.invalidateQueries({ queryKey: ['session', session.id] })` por si la ficha usa una query por id.

### 3. Verificación

- Abrir la ficha de un contacto, editar la fecha de una sesión a una franja que solape otra existente del mismo profesional.
- Confirmar que aparece el panel inline ámbar (no un diálogo encima).
- Pulsar "Guardar igualmente": el panel se cierra, el toast indica éxito, la fecha mostrada cambia y la interfaz sigue respondiendo (se puede volver a abrir/cerrar la sesión sin refrescar).
- Si el cambio no llegara a aplicarse, el nuevo log/error revelará si el RPC devolvió `null` (problema servidor) o si devolvió la fila correcta pero el frontend no la reflejó (problema cliente).

## Archivos a tocar

- `src/components/agenda/SessionDetailDrawer.tsx` — Quitar `ConflictsDialog`/handlers, añadir confirmación inline en la sección de edición de fecha/hora, mejorar `executeDateTimeSave` con manejo de `data`/`error` y logs.

No se tocan: `ConflictsDialog.tsx`, `Agenda.tsx`, ni la migración del RPC (ya está correcta).
