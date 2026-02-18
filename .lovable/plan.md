

## Fix: Auto-activar notificacion WhatsApp al crear cita

### Problema
Al crear una sesion desde los dialogos de agenda (CreateSessionDialog y QuickCreateSessionDialog), el checkbox de "Notificar por WhatsApp" siempre empieza desactivado (`false`). El centro tiene configurado el envio automatico por WhatsApp (wasender conectado + `wasender_confirm_booking = true`), pero esa configuracion no se usa para establecer el valor por defecto del checkbox.

### Causa raiz
En ambos dialogos, `notify_whatsapp` tiene un valor por defecto fijo de `false` y no hay ningun `useEffect` que lo actualice segun la configuracion del centro.

### Solucion

Agregar un `useEffect` en ambos dialogos que, al abrirse, compruebe si el centro tiene WhatsApp automatico habilitado (usando el hook `useWhatsAppDelivery` que ya esta importado en `SessionNotificationSettings`). Si `isAutomatic` es `true`, activar automaticamente `notify_whatsapp`.

### Cambios

#### 1. `src/components/agenda/CreateSessionDialog.tsx`
- Importar `useWhatsAppDelivery`
- Agregar un `useEffect` que al abrir el dialogo (`open = true`), si el delivery method es automatico, haga `form.setValue('notify_whatsapp', true)`

#### 2. `src/components/agenda/QuickCreateSessionDialog.tsx`
- Mismo cambio: importar `useWhatsAppDelivery` y agregar `useEffect` para auto-activar `notify_whatsapp` cuando el centro tiene envio automatico

### Detalle tecnico

```typescript
// En ambos dialogos, agregar:
const { isAutomatic } = useWhatsAppDelivery();

useEffect(() => {
  if (open && isAutomatic) {
    form.setValue('notify_whatsapp', true);
  }
}, [open, isAutomatic, form]);
```

Esto respeta la configuracion del centro: si tiene WasenderAPI conectado o Meta API configurado, el checkbox se activa por defecto. Si solo tiene modo manual, sigue desactivado.

### Archivos a modificar
- `src/components/agenda/CreateSessionDialog.tsx`
- `src/components/agenda/QuickCreateSessionDialog.tsx`
