
## Mostrar ID de reunión y contraseña de Zoom en la cita

### Problema actual
Cuando se crea una reunión de Zoom, la API devuelve el `meeting_id` y la `password`, pero solo se guarda el `join_url` en la base de datos. El paciente ve el enlace "Acceder a la videollamada" pero no tiene acceso al ID de la reunión ni a la contraseña, que pueden ser necesarios para unirse manualmente.

### Cambios necesarios

**1. Migración de base de datos** - Añadir 2 columnas a la tabla `sessions`:
```sql
ALTER TABLE public.sessions
  ADD COLUMN zoom_meeting_id text,
  ADD COLUMN zoom_password text;
```

**2. `src/hooks/useSessionIntegrations.tsx`** - Guardar los datos de Zoom al crear la reunión:
- Después de crear el meeting, devolver `zoom_meeting_id` y `zoom_password` en el resultado
- Actualizar el tipo `IntegrationResult` para incluir estos campos

**3. `src/hooks/usePublicSession.tsx`** - Incluir los nuevos campos en la consulta pública:
- Añadir `zoom_meeting_id` y `zoom_password` al SELECT
- Añadir al tipo `PublicSessionData`

**4. `src/pages/SessionManagement.tsx`** - Mostrar los datos bajo el enlace de Zoom:
- Debajo de "Acceder a la videollamada", mostrar:
  - **ID de reunión:** con el número formateado
  - **Contraseña:** con el valor

**5. Guardar los datos en la sesión** - En el flujo de creación de sesión (`CreateSessionDialog` o donde se llame a `handleSessionIntegrations`), guardar `zoom_meeting_id` y `zoom_password` en la fila de la sesión.

### Detalle tecnico

El flujo actual:
1. `create-zoom-meeting` devuelve `{ meeting_id, join_url, password }`
2. `useSessionIntegrations` solo guarda `join_url` como `video_call_link`

El flujo corregido:
1. `create-zoom-meeting` devuelve `{ meeting_id, join_url, password }` (sin cambios)
2. `useSessionIntegrations` devuelve tambien `zoom_meeting_id` y `zoom_password`
3. Al guardar la sesion, se escriben los 3 campos: `video_call_link`, `zoom_meeting_id`, `zoom_password`
4. La vista publica los muestra al paciente

### Archivos modificados
- **Migracion SQL**: nueva migracion para las 2 columnas
- `src/hooks/useSessionIntegrations.tsx`: devolver meeting_id y password
- `src/hooks/usePublicSession.tsx`: añadir campos al query y tipo
- `src/pages/SessionManagement.tsx`: mostrar ID y contraseña en la UI
- Archivos que llaman a `handleSessionIntegrations` y guardan el resultado en la sesion (para persistir los nuevos campos)
