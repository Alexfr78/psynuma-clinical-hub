# Desplegar stripe-webhook y ejecutar la conciliación protegida

## Estado verificado

- La función `stripe-webhook` ya contiene el endpoint de recuperación: acepta `{"action":"reconcile_pending","limit":N}` y exige la cabecera `x-cron-secret` comparada con `CRON_SECRET`.
- Si el secreto falta o no coincide, responde 401; si Stripe no está configurado, responde 500.
- La conciliación usa la clave de servicio y reutiliza el mismo procesamiento idempotente del webhook.

## Pasos a ejecutar (requieren salir de modo plan)

1. Desplegar la Edge Function `stripe-webhook` con el código sincronizado actual.
2. Confirmar que el despliegue termina correctamente antes de invocarla.
3. Llamar a `POST /functions/v1/stripe-webhook` con:
   - Cabecera `x-cron-secret` tomada del secreto `CRON_SECRET` (nunca mostrado ni registrado).
   - Cuerpo `{"action":"reconcile_pending","limit":50}`.
4. Devolver únicamente el JSON de respuesta, sin datos sensibles adicionales.

## Detalles técnicos

- Despliegue mediante la herramienta de despliegue de funciones del backend (no hay comandos CLI en el proyecto).
- La invocación se hará con una cabecera `Authorization` explícita para no ejecutar como la sesión de vista previa.
- No se modifica ningún archivo del proyecto: es una operación de despliegue y ejecución.
