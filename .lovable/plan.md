# Análisis del fallo y plan de reparación

## Diagnóstico (causa raíz confirmada con auditoría)

He rastreado lo ocurrido en `audit_logs` y `sessions`. La intuición es correcta: **lo causó la sincronización con Google Calendar**.

**Línea de tiempo de la sesión `ef6523c3-c28e-40d5-82cd-ee20cab10353` (Sergio Alonso):**

1. **14-abr 22:22** — Creada para el **27-abr 18:00–20:00**, vinculada al evento Google `i0lacm5ngvtcfsd7n0je8fkgts`.
2. **22-abr** — Varios reajustes de hora (entre 18:00 y 20:00).
3. **24-abr 17:15:07** — **UPDATE realizado por `service_role` (sin `user_id`)**: la sesión se cambió de `2026-04-27 18:00` → `2026-05-11 19:00`. Es decir, **el sync no creó una sesión nueva el 11 de mayo: SOBRESCRIBIÓ la del 27 de abril.**
4. **24-abr 17:31:04** — Otro UPDATE del service_role recalcula `updated_at`.

**Por qué pasó:**

En `supabase/functions/sync-google-calendar/index.ts` (líneas 1109-1146), cuando el modo es `two_way` y el evento de Google difiere de Psycma, hay este algoritmo:

```
if (googleUpdatedAt > psycmaUpdatedAt + 5_000ms) {
  // sobrescribe Psycma con la fecha/hora de Google
  UPDATE sessions SET session_date=..., start_time=..., end_time=... WHERE id = session.id
}
```

El usuario movió (o algún cliente de Google Calendar movió) el evento `i0lacm5ngvtcfsd7n0je8fkgts` del 27-abr 18:00 al 11-may 19:00 en Google. El siguiente sync vio "Google es más nuevo" y **sobrescribió la fila de Psycma**.

Esto destruye datos clínicos por tres razones graves:

1. **No hay verificación de colisión:** si ya existía otra sesión el 11-may 19:00, se duplican; y al revés, se "pierde" el slot del 27-abr sin dejar rastro de cancelación.
2. **No hay "tombstone":** la cita del 27-abr desaparece sin ningún registro de cancelación (`status='cancelled'`), sin notificación al paciente, sin huella visible en la agenda.
3. **El cambio en Google puede venir de cualquier integración** (otro dispositivo, una invitación reenviada, un cliente que reescribe el evento, incluso una limpieza automática). Aceptarlo ciegamente borra historial clínico.

## Plan de reparación

### 1. Restaurar la sesión perdida del 27 de abril 18:00

Insertar manualmente la sesión usando los datos exactos del audit log del UPDATE del 24-abr 17:15 (campo `metadata->'old'`). Mantener:
- Mismo `id` original NO se puede reusar (sigue ocupado por la sesión movida al 11 de mayo, que es válida y no debemos tocar).
- Crear una nueva sesión con un nuevo `id`, idénticos campos: paciente Sergio, profesional, `session_date=2026-04-27`, `start_time=18:00`, `end_time=20:00`, `session_modality=zoom`, `price=75`, `status=scheduled`, mismo Zoom meeting (81639912408).
- **`google_calendar_event_id = NULL`** para no reenviar a Google ni que el próximo sync la asocie con el evento equivocado.

Migración SQL controlada (con verificación previa de no-solapamiento).

### 2. Endurecer el sync para que NO vuelva a pasar (cambios en `sync-google-calendar/index.ts`)

Cambiar la rama "Google is newer → update Psycma" para que en lugar de **sobrescribir destructivamente**, la sincronización:

- **Detecte un movimiento grande** (cambio de día, o salto de tiempo > 2 h). Si lo hay, **NO sobrescribe**: crea una "solicitud de cambio pendiente" o, como mínimo, mantiene la sesión original y desvincula `google_calendar_event_id` para que el siguiente sync recree el evento en Google. La cita Psycma queda como fuente de verdad.
- Para cambios pequeños (<2 h dentro del mismo día), permitir la actualización pero registrarla en `audit_logs` con un `metadata.sync_source='google_two_way'` claro (hoy no se distingue).
- **Antes de cualquier UPDATE de fecha/hora vía sync**, verificar que NO existe otra sesión del mismo profesional en el destino. Si la hay, abortar y registrar conflicto.
- **Tope de seguridad:** nunca permitir que un sync mueva una sesión a una fecha **fuera de la ventana sincronizada** (`dateFrom..dateTo`). Mover algo de "hoy" a "+30 días" debería requerir intervención humana.

### 3. Añadir bandera de configuración en Ajustes → Integraciones → Google Calendar

Nueva opción **"Modo de conflictos two-way"** con tres valores:

- `psycma_wins` (recomendado, nuevo predeterminado): los cambios en Google nunca sobrescriben fechas en Psycma. Solo sincronizan título/descripción.
- `safe_two_way` (lo que implementaremos en el punto 2): permite cambios pequeños, bloquea movimientos grandes.
- `google_wins_legacy`: comportamiento actual, pero marcado claramente como riesgoso.

Para la cuenta del usuario afectado, dejar `psycma_wins` como valor activo tras la migración.

### 4. Notificación inmediata cuando el sync mueve una sesión

Cualquier cambio de fecha/hora que provenga del sync (Google → Psycma) debe:
- Crear una entrada en `notifications` para el profesional ("Google Calendar movió una sesión: revisa").
- Quedar registrado en `audit_logs` con `metadata.sync_source` y los valores antes/después.

### 5. Verificación post-fix

- Confirmar visualmente en `/agenda` que la cita del 27-abr 18:00 vuelve a aparecer.
- Confirmar que la cita del 11-may 19:00 sigue intacta (no la borramos).
- Probar el sync manualmente desde Ajustes para verificar que ya no sobrescribe fechas.

## Detalle técnico (resumen)

**Archivos a modificar:**

- `supabase/functions/sync-google-calendar/index.ts` — refactor del bloque `two_way` (líneas 1109-1146): añadir detección de movimiento grande, comprobación de solapamiento previo, respetar nueva flag, emitir notificación + audit metadata.
- `src/components/settings/` (sección de integración Google) — UI para elegir modo de conflictos.
- Migración SQL:
  - Añadir columna `google_calendar_conflict_mode TEXT DEFAULT 'psycma_wins'` a `professional_integrations`.
  - INSERT de la sesión restaurada del 27-abr 18:00 para Sergio Alonso (datos clonados del audit log).

**No tocar:**
- `src/integrations/supabase/client.ts` ni `types.ts` (regenerados).
- La lógica Psycma → Google (sigue funcionando bien para crear/actualizar eventos).
- La sesión actual del 11-may de Sergio (es legítima ahora, aunque su origen fue el bug).

## Riesgo del cambio

Bajo. Volvemos al comportamiento conservador "Psycma manda" que es el habitual en software clínico. El usuario podrá optar al modo permisivo si lo desea, pero por defecto sus datos quedan protegidos.
