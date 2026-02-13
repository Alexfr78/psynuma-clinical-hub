

## Corregir envio automatico de WhatsApp al crear sesion

### Problema
Al crear una sesion y marcar "Notificar por WhatsApp", el sistema abre un dialogo manual en lugar de enviar automaticamente via WasenderAPI, a pesar de que WasenderAPI esta habilitado y conectado.

### Causa raiz
Es el mismo patron de "mutaciones anidadas" que ya corregimos para las facturas. En `CreateSessionDialog` y `QuickCreateSessionDialog`, el flujo de creacion llama secuencialmente a multiples `mutateAsync()`:

1. `createSession.mutateAsync()` 
2. `deductBonoSession.mutateAsync()` (si hay bono)
3. `scheduleReminder.mutateAsync()` (si hay recordatorios)
4. `sendNotification.mutateAsync()` (notificacion inmediata)

La cuarta mutacion falla silenciosamente porque React Query tiene problemas gestionando el estado de multiples mutaciones encadenadas. El `catch` general captura el error sin dar visibilidad, y como la notificacion no se ejecuta, el sistema no detecta WasenderAPI y cae al modo manual mostrando el dialogo.

Esto se confirma porque los logs del edge function `wasender-send-message` estan vacios: nunca se llega a invocar la funcion.

### Solucion

Extraer la logica de envio de notificaciones de `useSendSessionNotification` a una funcion asincrona independiente que no dependa del ciclo de vida de React Query. Luego, llamar a esa funcion directamente desde los dialogos de creacion.

### Cambios

#### 1. `src/hooks/useSendSessionNotification.tsx`

- Extraer la logica del `mutationFn` actual a una funcion exportada independiente: `sendSessionNotificationDirect(params, centerId, center)`
- Mantener el hook `useSendSessionNotification` existente como wrapper que llama a esa funcion (para no romper otros consumidores)
- La funcion directa ejecuta la misma logica: verificacion de duplicados, rate limiting, seleccion de canal (Wasender > Meta API > Manual), construccion de plantillas

#### 2. `src/components/agenda/CreateSessionDialog.tsx`

- Importar `sendSessionNotificationDirect` en lugar de usar `sendNotification.mutateAsync()`
- Llamar directamente a la funcion con los parametros necesarios, pasando `profile.center_id` y `center`
- Mantener la misma logica de mostrar el dialogo manual solo si `whatsappAutoSent` es false
- Invalidar queries de notificaciones manualmente despues de la llamada

#### 3. `src/components/agenda/QuickCreateSessionDialog.tsx`

- Aplicar el mismo cambio: reemplazar `sendNotification.mutateAsync()` por `sendSessionNotificationDirect()`
- Mantener el comportamiento identico al de `CreateSessionDialog`

### Resultado esperado

Cuando el usuario marca "WhatsApp" en "Notificar ahora" y WasenderAPI esta conectado:
- El mensaje se envia automaticamente sin abrir ningun dialogo
- Se muestra un toast "WhatsApp enviado automaticamente"
- El badge deberia mostrar "Auto" en lugar de "Manual" (esto ya funciona correctamente via `useWhatsAppDelivery`)

### Archivos a modificar
- `src/hooks/useSendSessionNotification.tsx` - Extraer funcion directa
- `src/components/agenda/CreateSessionDialog.tsx` - Usar funcion directa
- `src/components/agenda/QuickCreateSessionDialog.tsx` - Usar funcion directa
