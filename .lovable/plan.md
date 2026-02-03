
# Plan: Corregir la funcionalidad "Agenda Cerrada"

## Resumen del problema

He investigado el sistema y encontré varios problemas que impiden el correcto funcionamiento de "Agenda cerrada":

1. **El campo `portal_agenda_closed` está en `false` en la base de datos** - aunque indicas que lo activaste, el valor no se guardó correctamente
2. **La ruta de acceso** que usas (`/reservas/`) no coincide con la ruta de la app (`/book/reservas`)
3. **Posibles problemas de visibilidad del toggle** y guardado del estado

## Cambios a implementar

### 1. Añadir ruta alternativa `/reservas/:centerSlug`
Crear una ruta adicional para que funcione tanto `/book/reservas` como `/reservas/reservas`

**Archivo:** `src/App.tsx`

```
Añadir ruta: <Route path="/reservas/:centerSlug" element={<PublicBooking />} />
```

### 2. Mejorar visibilidad del toggle "Agenda cerrada"
Mover el toggle fuera de la condición anidada para que sea más visible y accesible

**Archivo:** `src/components/settings/PortalSettingsSection.tsx`

- Cambiar el toggle de "Agenda cerrada" para que esté al mismo nivel que "Activar reservas públicas"
- Añadir indicador visual más claro cuando está activo
- Asegurar que se guarda correctamente incluso cuando se activa/desactiva rápidamente

### 3. Añadir logging de depuración en la Edge Function
Para verificar que el valor se está leyendo correctamente del backend

**Archivo:** `supabase/functions/public-booking/index.ts`

- Añadir log del valor de `portal_agenda_closed` al obtener la configuración

### 4. Verificar y corregir la sincronización de estado
Asegurar que el valor local se mantiene sincronizado con la base de datos

## Pasos de verificación

1. Activar el toggle "Agenda cerrada" en Configuración > Portal de Pacientes
2. Guardar cambios (botón "Guardar Cambios")
3. Refrescar la página y verificar que el toggle sigue activo
4. Acceder a `/book/reservas` y verificar que se muestra la pantalla de "Agenda cerrada"

## Notas técnicas

- La ruta actual de reservas públicas es `/book/:centerSlug`
- El slug del centro en la base de datos es `reservas`
- El dominio personalizado `psicologosexual.com` probablemente tiene una redirección que necesita apuntar a `/book/reservas`
