

## Problema

El `api_key` de la sesion WasenderAPI nunca se guardo en la base de datos. La funcion `wasender-get-session` solo guarda el `api_key` cuando el estado cambia, pero como ya estaba "connected", nunca se ejecuto el update. Resultado: `api_key = NULL` en la tabla `whatsapp_sessions`.

Al enviar, `wasender-send-message` hace `session.api_key || wasenderApiKey` — como api_key es null, usa el Personal Access Token, que WasenderAPI rechaza con "invalid API key" para el endpoint `/api/send-message`.

## Solucion

### 1. Fix `wasender-get-session/index.ts`
Guardar el `api_key` **siempre** que este disponible en la respuesta de WasenderAPI, no solo cuando cambia el estado. Mover la logica de guardado de `api_key` fuera del `if (mappedStatus !== session.status)`.

Ademas, forzar un update inmediato si `api_key` existe en la respuesta pero no en la DB.

### 2. Fix `wasender-send-message/index.ts`  
Si `session.api_key` es null, antes de intentar enviar, hacer una llamada rapida a la API de WasenderAPI para obtener el `api_key` de la sesion y guardarlo. Esto actua como fallback para sesiones que ya estaban conectadas antes de la migracion.

### Archivos a modificar
- `supabase/functions/wasender-get-session/index.ts` — siempre persistir `api_key` cuando disponible
- `supabase/functions/wasender-send-message/index.ts` — fetch api_key de WasenderAPI si no esta en DB

### Redespliegue
Redesplegar ambas funciones tras los cambios.

