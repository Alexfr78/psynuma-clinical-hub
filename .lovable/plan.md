

## Actualizar email de envío a dominio verificado

### Problema
Hay 5 edge functions que tienen hardcodeado `onboarding@resend.dev` como dirección de envío. Solo una (`send-notification`) lee el secret `RESEND_FROM_EMAIL`, pero las otras 4 lo ignoran. Esto causa que los emails fallen con el error "You can only send testing emails to your own email address".

### Solución

**Paso 1: Actualizar el secret `RESEND_FROM_EMAIL`**
- Cambiar el valor a `alejandro@psicologosexual.com`

**Paso 2: Actualizar las 5 edge functions para usar el secret**

Cada función que envía emails pasará a leer `RESEND_FROM_EMAIL` del entorno en lugar de tener `onboarding@resend.dev` hardcodeado:

1. **`send-notification/index.ts`** - Ya lee el secret, solo eliminar el fallback a `onboarding@resend.dev`
2. **`patient-portal-auth/index.ts`** - Cambiar `onboarding@resend.dev` por `Deno.env.get("RESEND_FROM_EMAIL")`
3. **`patient-portal-register/index.ts`** - Mismo cambio
4. **`send-session-reminders/index.ts`** - Mismo cambio
5. **`send-invoice-notification/index.ts`** - Mismo cambio

**Paso 3: Redesplegar las 5 funciones**

### Detalle tecnico

En cada funcion, la linea:
```
from: `${name} <onboarding@resend.dev>`
```
se reemplazara por:
```
const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "alejandro@psicologosexual.com";
// ...
from: `${name} <${fromEmail}>`
```

Esto garantiza que todos los emails salgan desde el dominio verificado `psicologosexual.com`.

