

## Diagnostico: Recordatorios de cita

### Lo que esta pasando

He revisado los datos y logs en detalle. El sistema de recordatorios **si se ejecuto hoy a las 10:00 (hora Madrid)**, pero con resultados parciales:

**Sesiones de mañana (25 Feb):**

```text
Sesion 18:00 → WhatsApp a +34646462507 → PENDIENTE (no enviado)
Sesion 19:00 → WhatsApp a +34645702741 → ENVIADO correctamente
Sesion 20:00 → Paciente "[Bloqueado] Google Calendar" → Sin datos de contacto, saltado
```

El recordatorio de la sesion de las 18:00 fallo al enviarse por WasenderAPI y cayo al modo "web" (manual), creando una notificacion con status "pending" en vez de enviarla automaticamente. **El error no quedo registrado** porque el codigo descarta el error silenciosamente cuando falla WasenderAPI y simplemente pasa al siguiente metodo (linea 599-601).

**Patron recurrente**: Ayer tambien hubo multiples notificaciones que quedaron como "pending" en vez de enviarse. Los numeros que fallan tienen formatos variados (`+34603 40 01 70`, `686920520`, etc.) pero la limpieza de formato deberia funcionar.

### Causa raiz

Cuando WasenderAPI falla para un numero, el codigo:
1. Registra el error en la consola (que luego se pierde)
2. **No guarda el motivo del fallo** en la base de datos
3. Cae silenciosamente al modo "web" (manual) marcando status = "pending"
4. El profesional nunca se entera de que fallo ni por que

### Cambios propuestos

**1. Guardar el error real de WasenderAPI en la notificacion**

Cuando WasenderAPI falle, en vez de caer silenciosamente a modo web, guardar el error especifico como `error_message` en la notificacion para poder diagnosticar.

**2. Reintentar envio una vez si WasenderAPI falla**

Añadir un reintento automatico con espera de 3 segundos antes de dar por fallido.

**3. Marcar como "failed" en vez de "pending" cuando falla el envio automatico**

Si WasenderAPI esta habilitado y el envio falla, el status debe ser "failed" con el error guardado, no "pending" (que implica que esta esperando envio manual).

**4. Añadir log persistente del resultado de cada envio**

Guardar un resumen en el campo `error_message` de la notificacion incluso en caso de exito parcial.

### Archivos modificados

- `supabase/functions/send-session-reminders/index.ts` - Reintento, guardar errores, marcar failed correctamente

### Detalle tecnico

```text
Flujo actual (buggy):
WasenderAPI falla → log consola → cae a web mode → status "pending" → usuario no sabe que fallo

Flujo corregido:
WasenderAPI falla → reintenta 1 vez (3s espera) → si falla de nuevo:
  → guarda error en error_message
  → status "failed" (no "pending")
  → el profesional ve en Notificaciones que fallo y por que
```

