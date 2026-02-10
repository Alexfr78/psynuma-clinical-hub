
# Notificar al terapeuta por email cuando el paciente cancela o reprograma

## Problema
Actualmente, las notificaciones al terapeuta dependen del sistema de "Admin Alerts", que requiere configuracion especifica (activar alertas, habilitar eventos, marcar "incluir profesional"). El resultado es que el terapeuta no recibe ningun aviso cuando un paciente cambia o cancela su cita desde el portal o el enlace publico.

## Solucion
Enviar siempre un email directo al profesional asignado a la sesion cuando el paciente cancela o reprograma, sin depender de la configuracion de alertas admin. Esto se hara insertando una notificacion de tipo `email` en la tabla `notifications` y disparando `send-notification` de forma inmediata (el mismo mecanismo que ya funciona para las notificaciones al paciente).

## Cambios por archivo

### 1. `supabase/functions/patient-portal-sessions/index.ts`

**Accion "cancel" (linea ~408):**
- Ampliar la query de `existingSession` para incluir `professional_id`
- Despues del admin alert existente, obtener el email del profesional desde `profiles` y crear una notificacion email directa

**Accion "reschedule" (linea ~576):**
- Ya tiene `professional_id` en la query
- Despues del admin alert existente, enviar email directo al profesional con los datos del cambio (fecha antigua y nueva)

### 2. `supabase/functions/public-session-reschedule/index.ts`

**Accion "reschedule" (linea ~207):**
- Ya tiene datos del profesional cargados
- Despues del admin alert, enviar email directo al profesional

**Accion "cancel" (linea ~374):**
- Ya tiene datos del profesional cargados
- Despues del admin alert, enviar email directo al profesional

### 3. Nuevo helper: `supabase/functions/_shared/professionalNotification.ts`

Para evitar duplicar codigo en los 4 puntos, crear un helper reutilizable:

```
export async function notifyProfessionalByEmail(params: {
  supabase: any;
  centerId: string;
  professionalId: string;
  patientId: string;
  sessionId: string;
  subject: string;
  message: string;
}): Promise<void>
```

Logica:
1. Obtener email del profesional desde `profiles`
2. Si no tiene email, salir sin error
3. Insertar notificacion en tabla `notifications` con `type: 'email'`, `status: 'pending'`, `scheduled_for: now()`
4. Invocar `send-notification` via fetch (como ya se hace en adminAlerts)
5. Log del resultado, sin bloquear la operacion principal si falla

## Contenido del email

**Cancelacion:**
- Asunto: `Cita cancelada - [Nombre Paciente] - [Fecha]`
- Cuerpo: Datos del paciente, fecha/hora cancelada, motivo (si lo hay)

**Reprogramacion:**
- Asunto: `Cita reprogramada - [Nombre Paciente] - [Nueva Fecha]`
- Cuerpo: Datos del paciente, fecha/hora anterior, nueva fecha/hora

## Despliegue
- Redesplegar: `patient-portal-sessions`, `public-session-reschedule`

## Impacto
- El terapeuta recibira un email siempre que su paciente cancele o reprograme
- No depende de la configuracion de admin alerts (es independiente)
- No afecta las notificaciones existentes al paciente ni las admin alerts
- Si el profesional no tiene email configurado, simplemente no se envia (sin error)
