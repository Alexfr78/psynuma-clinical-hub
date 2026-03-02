

## Problema

La edge function `wasender-send-message` usa un endpoint que no existe en WasenderAPI: `/api/whatsapp-sessions/60354/messages/text`, lo que devuelve un 404 con una pagina HTML. Esto causa que el envio automatico falle y el sistema caiga al fallback manual (abrir WhatsApp Web).

Segun la documentacion oficial de WasenderAPI, el endpoint correcto es:

```text
POST https://www.wasenderapi.com/api/send-message
Authorization: Bearer <SESSION_API_KEY>
```

Se autentica con el **API Key de la sesion** (almacenado en la respuesta de get-session), no con el Personal Access Token.

## Solucion

### Cambio en `supabase/functions/wasender-send-message/index.ts`

1. Cambiar el fetch para usar el endpoint correcto: `POST /api/send-message`
2. Autenticar con el **API Key de la sesion** (obtenerlo de la tabla `whatsapp_sessions` o del campo que ya existe, o leerlo desde la API de get-session). Dado que el session API key ya esta visible en los logs de `wasender-get-session`, hay dos opciones:
   - **Opcion A**: Almacenar el `api_key` de la sesion en la tabla `whatsapp_sessions` (campo nuevo) y usarlo directamente
   - **Opcion B**: Seguir usando el `WASENDER_PERSONAL_ACCESS_TOKEN` pero con el endpoint generico `/api/send-message` (que tambien acepta el PAT si la sesion esta activa)

La opcion mas simple es **Opcion B**: usar `POST https://www.wasenderapi.com/api/send-message` con el `WASENDER_PERSONAL_ACCESS_TOKEN` que ya esta configurado como secret. Segun la documentacion, `YOUR_API_KEY` se refiere al API key de la sesion, pero el PAT tambien funciona como authentication.

Sin embargo, dado que el PAT con `/api/send-message` es lo que habia antes y daba error 404 en el endpoint de sesion... revisando los logs de nuevo:

```
endpoint: "https://www.wasenderapi.com/api/send-message"  (log viejo)
```

Pero el fetch real va a `/api/whatsapp-sessions/60354/messages/text` que no existe. El codigo del archivo tiene las dos cosas mezcladas: el log dice una URL y el fetch usa otra.

### Plan concreto

1. **Actualizar `wasender-send-message/index.ts`**: Cambiar el fetch URL a `${WASENDER_API_URL}/send-message` (que es `https://www.wasenderapi.com/api/send-message`) y usar el **session API key** del campo en la tabla `whatsapp_sessions`
2. **Agregar columna `api_key`** a `whatsapp_sessions` si no existe, o leer el API key que `wasender-get-session` ya obtiene de WasenderAPI
3. **Actualizar `wasender-get-session`** para guardar el `api_key` de la sesion en la tabla
4. **Actualizar todas las edge functions** que envian WhatsApp (`send-session-reminders`, `send-notification`, `wasender-send-reminders`) para usar el mismo patron
5. **Redesplegar** las funciones afectadas

### Archivos a modificar

- `supabase/functions/wasender-send-message/index.ts` — usar endpoint correcto con session API key
- `supabase/functions/wasender-get-session/index.ts` — guardar `api_key` en la tabla
- 1 migracion SQL — agregar campo `api_key` a `whatsapp_sessions` si no existe
- `supabase/functions/send-session-reminders/index.ts` — mismo fix de endpoint
- `supabase/functions/wasender-send-reminders/index.ts` — mismo fix de endpoint

