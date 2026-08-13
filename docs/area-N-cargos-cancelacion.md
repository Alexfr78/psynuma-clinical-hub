# Área N — Cargo por cancelación / no-show con tarjeta en archivo

Capacidad **nueva** (fase siguiente, no requisito de lanzamiento). Permite que
el paciente guarde una tarjeta y que Psycma haga un cargo **iniciado por el
comercio** (sin el paciente presente) cuando aplica un cargo por cancelación
tardía o no presentación, según el sistema de cancelaciones ya existente.

Es la pieza más sensible del proyecto: toca PSD2/SCA, consentimiento y encaje
fiscal. **Nunca** se almacena el número de tarjeta; solo identificadores de Stripe.

## Estado del que se parte (ya implementado)

- Sistema de cancelaciones: política versionada, reglas y cálculo del cargo
  (`cancellationPolicy.ts`, `paymentRules.ts`, `generate-pending-debts`).
- **Clickwrap de la política** con evidencia (versión, IP, checkboxes) en el
  booking público y en el portal del paciente (`cancellationPolicyClickwrap.ts`,
  `PublicBooking.tsx`, `PortalBooking.tsx`).
- Momento del cobro (antes / al comenzar / al finalizar la sesión): ya existe
  (`payment-mode`).
- Cobros iniciados por el paciente (sesión / deuda / bono) vía Checkout conectado.

Hoy el cargo por cancelación se materializa como **deuda cobrada por enlace**,
no como cargo automático a una tarjeta guardada.

## Decisiones tomadas

| # | Decisión |
|---|---|
| 1 | Configurable a nivel de **centro** (por defecto) y **paciente** (override). |
| 2 | Configurable desde el panel del centro; **predeterminado: autocobro**. Respeta el momento (antes/inicio/fin), que ya está implementado. |
| 3 | Tarjeta **ligada al profesional** (Customer/PaymentMethod en su cuenta conectada). |
| 4 | **Ventana de gracia** clara antes del cargo: se explica al usuario qué se cobrará y cuándo, con opción de cancelar/justificar antes. |
| 5 | Mandato = se **reutiliza el clickwrap existente**, con 2 deltas (ver abajo). |

## Modelo de datos

**Nueva tabla `patient_payment_methods`** (solo ids de Stripe, nunca el PAN):

```
id, center_id, patient_id, professional_id,
stripe_customer_id, stripe_payment_method_id, connected_account_id,
brand, last4, exp_month, exp_year,
mandate_policy_version_id, mandate_accepted_at, mandate_ip,
status ('active'|'removed'|'expired'), created_at
```

**Ampliar `cancellation_charges`** (ya existe):

```
+ stripe_payment_intent_id
+ charge_status ('scheduled'|'pending_review'|'charging'|'succeeded'|'requires_action'|'failed'|'refunded')
+ scheduled_for            -- ventana de gracia (decisión 4)
+ off_session_error, reviewed_by, reviewed_at
```

**Configuración (decisión 1):**
- Centro: default de autocobro on/off + modo (autocobro | supervisado) + horas de ventana de gracia.
- Paciente: override opcional del comportamiento del centro.

## Modelo Connect (decisión 3)

Mismo esquema de **direct charge** que ya se usa. El `Customer` y el
`PaymentMethod` viven **en la cuenta conectada del profesional** (header
`Stripe-Account`). El `PaymentIntent` off-session lleva `application_fee_amount`
según `STRIPE_APPLICATION_FEE_BPS`. Coherente con `stripeConnectedCheckout.ts`.

## Mandato SCA (decisión 5)

El clickwrap actual es la infraestructura correcta y se **reutiliza**. Faltan
2 deltas para que sirva como mandato de cargo off-session:

1. **Vincular la aceptación al método de pago guardado** (al `SetupIntent`), no
   solo a la cita/versión de política. Si la tarjeta se guarda en el mismo paso
   de la reserva, basta con enlazar el `payment_method` a ese registro.
2. **Añadir una frase de autorización off-session** al check, del tipo:
   *"Autorizo a [profesional] a cargar en esta tarjeta los importes por
   cancelación tardía o no presentación según la política de cancelación."*
   (Recomendable que asesoría revise solo esta frase, no la política entera.)

## Flujos

### A. Alta de tarjeta (setup)

1. Frontend (portal / registro) → edge **`create-setup-intent`**: crea/recupera
   `Customer` en la cuenta conectada, crea `SetupIntent` con `usage: 'off_session'`,
   devuelve `client_secret`.
2. Paciente introduce la tarjeta en **Stripe Elements** y acepta el mandato
   (clickwrap + frase de autorización).
3. Webhook **`setup_intent.succeeded`** → guarda `payment_method` + evidencia del
   mandato en `patient_payment_methods`.

### B. Cargo por cancelación / no-show

1. La lógica de cancelación decide que procede cargo → crea `cancellation_charges`.
   - Autocobro (default) → `charge_status='scheduled'` con `scheduled_for` = fin de la ventana de gracia.
   - Supervisado (config centro) → `charge_status='pending_review'`.
2. Ventana de gracia (decisión 4): visible al usuario ("se cobrará X € el [fecha] a las HH:MM"), con opción de anular/justificar.
3. Al vencer la ventana (o al aprobar el profesional) → edge **`charge-cancellation`**:
   `PaymentIntent` `off_session:true, confirm:true` con `customer`+`payment_method`,
   en la cuenta conectada, `idempotency_key = cancellation_charge_id`.
4. Resultados:
   - **Éxito** → `succeeded`; genera pago + factura por el pipeline existente.
   - **`authentication_required`** (banco pide 3DS) → **fallback obligatorio**:
     crear deuda + enviar enlace de pago (Checkout de deudas existente);
     `charge_status='requires_action'`.
   - **Rechazada / caducada** → `failed`; notificar + fallback a enlace.
5. Webhook `payment_intent.succeeded` / `payment_intent.payment_failed` reconcilia
   (idempotente, reutiliza la infra de webhooks actual).

### C. Gestión

- Paciente elimina tarjeta (portal) → `detach` del PM + `status='removed'`.
- Caducidad: manejar al fallar el cargo (+ opcional webhook `payment_method.automatically_updated`).

## Piezas nuevas

| Tipo | Qué |
|---|---|
| Edge | `create-setup-intent`, `charge-cancellation` |
| Webhook | añadir `setup_intent.succeeded`; reutilizar `payment_intent.*` en `stripe-webhook` |
| Frontend | Portal: guardar/quitar tarjeta · Registro/booking: guardar tarjeta + frase de autorización · Agenda: no-show → genera charge · Cobros: ver/aprobar cargos programados · Ajustes→Cancelaciones: autocobro/supervisado + ventana de gracia (centro) y override (paciente) |
| Fiscal | Cargo cobrado → factura según reglas del Área I; devolución parcial según política (decisión 6 del proyecto) |

## Cumplimiento / seguridad

- Solo se almacenan **ids de Stripe**, nunca el número de tarjeta.
- Mandato SCA capturado en el setup + evidencia; los off-session pueden disparar
  3DS igualmente → el fallback `requires_action` es **obligatorio**.
- RLS por `center_id`; solo profesional/admin dispara el cargo.
- No exponer datos sensibles al paciente en errores.
- Texto de autorización off-session → revisar con asesoría.

## Fuera de alcance de la v1 (posible después)

- Exenciones SCA (TRA/MIT) para reducir fricción de 3DS.
- Tarjeta compartida a nivel de centro entre varios profesionales.
- Métodos de pago distintos de tarjeta para off-session.
