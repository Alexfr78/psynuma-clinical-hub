# Runbook: paso de Stripe Sandbox → Producción

Procedimiento para activar cobros reales con Stripe Connect en Psycma. Sigue los
pasos en orden. No cobres dinero real hasta completar la sección 6 (verificación).

- **Proyecto Supabase:** `zprkdxmluvirxfhswrzq`
- **Endpoint webhook:** `https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/stripe-webhook`
- **Rama de despliegue:** `main` (Lovable observa solo `main`)
- **Regla actual de comisión:** `STRIPE_APPLICATION_FEE_BPS = 0` (Psycma no cobra comisión)

> Las tarifas propias de Stripe (por transacción) son independientes de la comisión
> de Psycma. `STRIPE_APPLICATION_FEE_BPS` solo controla la comisión de plataforma.

---

## 0. Antes de empezar

- [ ] Confirmar que `main` está desplegado y verificado en Sandbox (Cobros muestra netos, reembolsos, solo lectura).
- [ ] Tener acceso a: consola de Stripe (modo producción), secretos de Supabase/Lovable, y la cuenta del profesional a conectar.
- [ ] Avisar de una ventana de mantenimiento corta (los pagos en curso podrían fallar durante el cambio de claves).

## 1. Entorno real de Stripe

- [ ] En Stripe, salir del modo test → **modo producción (live)**.
- [ ] Confirmar que la plataforma Connect está activa en live (perfil de plataforma completo).

## 2. Claves reales en Supabase (secretos)

Sustituir los secretos Sandbox por los **live**. Mantener los nombres:

- [ ] `STRIPE_SECRET_KEY` → clave secreta live (`sk_live_…`)
- [ ] `STRIPE_ENVIRONMENT` → `live` (protege las funciones contra claves y Checkout de Sandbox)
- [ ] `STRIPE_WEBHOOK_SECRET` → secreto del webhook de **plataforma** (ver paso 3)
- [ ] `STRIPE_CONNECT_WEBHOOK_SECRET` → secreto del webhook de **cuentas conectadas** (ver paso 3)
- [ ] `STRIPE_APPLICATION_FEE_BPS` → `0` (salvo decisión comercial de cobrar comisión)

> Guardar las claves Sandbox en un sitio seguro por si hay que volver atrás (sección 7).

## 3. Webhooks de producción

Crear **dos** destinos en Stripe (live), ambos apuntando al mismo endpoint:

- [ ] **Webhook de plataforma** → `…/functions/v1/stripe-webhook`
  Su *signing secret* va a `STRIPE_WEBHOOK_SECRET`.
- [ ] **Webhook de cuentas conectadas** (marcar "Listen to events on Connected accounts")
  → mismo endpoint. Su *signing secret* va a `STRIPE_CONNECT_WEBHOOK_SECRET`.

Eventos mínimos a seleccionar en ambos:

- [ ] `checkout.session.completed`
- [ ] `checkout.session.expired`
- [ ] `charge.refunded`
- [ ] `payment_intent.payment_failed`
- [ ] (si aplica) `account.updated` — estado de la cuenta conectada

> Seleccionar solo los eventos necesarios; menos ruido y menos reintentos.

## 4. Reconexión de profesionales

Las cuentas conectadas de Sandbox **no** pasan a producción.

- [ ] Reconectar a cada profesional mediante el flujo de conexión de Stripe (en live).
- [ ] Confirmar en la cuenta conectada: **pagos habilitados** y **transferencias habilitadas** (sin datos/identidad pendientes).
- [ ] Verificar que Psycma guardó el nuevo `stripe_account_id` (`oauth_connections`, provider `stripe`, estado `active`).

## 5. Comisión

- [ ] Confirmar `STRIPE_APPLICATION_FEE_BPS = 0` (o el valor comercial acordado).
- [ ] Un pago de prueba (sección 6) debe reflejar `platform_fee_amount = 0` en los metadatos.

## 6. Verificación con dinero real (importe pequeño)

- [ ] Hacer un **pago de sesión** real de importe pequeño.
- [ ] Hacer un **pago de deuda o bono** real de importe pequeño.
- [ ] Confirmar en Stripe + Psycma:
  - [ ] El dinero llega a la **cuenta conectada correcta** del profesional.
  - [ ] `platform_fee_amount` coincide con la configuración (0 si no hay comisión).
  - [ ] El webhook responde **200** y Psycma marca el pago **completado**.
  - [ ] Se genera/actualiza la **factura** y el estado del cobro es correcto.
- [ ] **Reenviar** el webhook desde Stripe y confirmar que **no** duplica pagos, facturas ni notificaciones.
- [ ] Hacer un **reembolso controlado** y confirmar en Cobros: importe neto, etiqueta de reembolso y fila en solo lectura.

## 7. Plan de vuelta atrás (rollback)

Si algo falla en producción:

- [ ] Restaurar los secretos Sandbox (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`).
- [ ] Deshabilitar (no borrar) los webhooks live mientras se investiga.
- [ ] Revisar `stripe_webhook_events` (eventos fallidos) e `integration_errors` (avisos de reembolso/bono).
- [ ] No borrar registros fiscales encadenados de Verifactu sin revisar dependencias.

## 8. Activación gradual

- [ ] Activar producción **por fases**, no para todos los profesionales a la vez.
- [ ] Vigilar `integration_errors` y los eventos de webhook los primeros días.

## 9. AEAT / Verifactu

- [ ] Configurar el entorno **real** de AEAT solo cuando se vayan a emitir facturas reales.
- [ ] Separar claramente datos, certificados y credenciales de Sandbox y producción.
- [ ] Validar el tratamiento fiscal de reembolsos con asesoría antes de usar AEAT producción.

---

## Rotación de claves sin cortar pagos

1. Generar la nueva clave/secret en Stripe (deja la anterior activa).
2. Actualizar el secreto en Supabase.
3. Para webhooks: Stripe permite **roll** del signing secret con periodo de gracia;
   actualizar `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` dentro de ese periodo.
4. Verificar con un evento de prueba antes de revocar la clave antigua.
5. Revocar la clave anterior solo tras confirmar que todo funciona.

## Recuperación ante clave comprometida

1. **Revocar de inmediato** la clave comprometida en Stripe.
2. Generar y desplegar la clave nueva (pasos de rotación).
3. Revisar la actividad reciente en Stripe por cargos/reembolsos no autorizados.
4. Revisar el historial de Git y registros para confirmar que la clave no quedó expuesta.
