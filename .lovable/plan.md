# Reactivar el flujo de cambio de ubicación al reprogramar

## Diagnóstico

- En `src/pages/SessionManagement.tsx` el selector de ubicación está condicionado a `locations.length > 0`. Si la lista llega vacía, no aparece ni el selector, ni la tarjeta de la ubicación actual, ni el aviso ámbar de "estás cambiando la ubicación".
- En BBDD hay 2 ubicaciones públicas activas para el centro de pruebas (`Consulta Eguilaz` y `Consulta Online`), así que el dato existe.
- Al invocar el edge function desplegado con `{"action":"get-locations","token":"fbe739ff…"}` responde **`{"error":"Invalid action"}`** con HTTP 400. Es decir, la versión en producción del edge function todavía no conoce la acción `get-locations` que añadimos en el último cambio: el deploy automático no se aplicó.
- Lo mismo ocurre con `patient-portal-sessions` (mismo patrón de cambios añadidos en la misma tanda) y conviene comprobarlo también.

El código local de los edge functions sí contiene la acción (`supabase/functions/public-session-reschedule/index.ts` línea 185 y `supabase/functions/patient-portal-sessions/index.ts`), por tanto **no hay nada que reescribir**: solo hay que forzar un redeploy.

## Cambios a realizar

1. **Forzar redeploy de `public-session-reschedule`**
   - Hacer una edición no-op (p.ej. añadir un comentario de versión `// v: location-selector`) en `supabase/functions/public-session-reschedule/index.ts` para que Lovable Cloud lo vuelva a desplegar.
   - Verificar con `curl` a la función desplegada que `{"action":"get-locations","token":"fbe739ff…"}` devuelve `{"locations":[…2 items…], "originalLocationId":"…"}`.

2. **Forzar redeploy de `patient-portal-sessions`**
   - Misma edición no-op en `supabase/functions/patient-portal-sessions/index.ts`.
   - Verificar que la nueva acción `get-locations` (y la aceptación de `newLocationId` en `reschedule`) está activa.

3. **Verificar `update-google-calendar-event`**
   - Confirmar con un curl mínimo que acepta el nuevo parámetro `location`. Si la versión desplegada lo ignora, añadir el mismo marcador de versión y redeplegar.

4. **Verificación funcional en preview**
   - Abrir el enlace de la cita de prueba (`/cita/fbe739ff5d56b6d651f872fa8c46816d`).
   - Confirmar que en "Cambiar fecha" aparece:
     - El selector de ubicación con las 2 ubicaciones públicas.
     - La fila preseleccionada coincide con la ubicación original de la cita.
     - Al cambiarla, se resetean fecha y hora y se muestra el aviso ámbar.
     - El `AlertDialog` de confirmación final muestra original vs nueva ubicación.

## Detalles técnicos

- No se toca lógica frontend; el problema es 100 % de despliegue.
- El marcador de versión es solo un comentario; basta para que el sistema detecte cambios y vuelva a empaquetar la función.
- No se modifica `supabase/config.toml` ni se cambian permisos: las funciones siguen siendo públicas (sin JWT) como antes.
- Tras el redeploy, los hooks `usePublicSessionReschedule` y `usePatientPortal` ya están preparados para consumir el nuevo `originalLocationId` y enviar `newLocationId`.

## Riesgos

- Ninguno funcional: solo se añade un comentario.
- Si tras el redeploy `get-locations` sigue devolviendo "Invalid action", revisar los logs de deploy del edge function (posible fallo de bundling con `deno.lock` u otra dependencia) y, en ese caso, abordarlo en una segunda iteración.
