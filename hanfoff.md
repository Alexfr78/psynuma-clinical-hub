# HANDOFF — Psycma/Psynuma

## 0. CÓMO USAR ESTE DOCUMENTO

Este handoff tiene dos partes:
- **Sección A** — feature "Política de cancelaciones": **CERRADA**, resumen breve para contexto histórico (el detalle completo del proceso, decisiones y bugs resueltos está en el historial de commits `d154fa7`…`cb522bb`; no hace falta releerlo para lo que sigue).
- **Sección B** — foco actual: **pasar Stripe de sandbox a producción**. Es lo que falta para poder cobrar dinero real.

---

## A. Política de cancelaciones — CERRADA (referencia)

Feature completa y desplegada en las 3 superficies de reprogramación (`/cita/:token`, portal del paciente logueado, reserva pública sin login):
1. Interruptor maestro (centro) + override por paciente.
2. Guardado de tarjeta al reservar (SetupIntent 0€, Stripe Connect).
3. Cobro supervisado (botón manual) a la tarjeta guardada por cancelación tardía / no-show.
4. Cierre del loophole de reprogramación (se cobra igual que cancelación tardía, contra el horario original).
5. Aviso previo (banner ámbar con importe) antes de confirmar una reprogramación con cargo, en las 3 superficies — **confirmado en producción por el usuario en las 3**.
6. UX: auto-scroll a horarios/confirmación al ir seleccionando fecha/hora al reprogramar (commit `cb522bb`, desplegado).

**Pendiente relacionado, no bloqueante, sin decidir:**
- Incremento 2b (autocobro automático de cancelaciones sin botón manual — ventana de gracia + cron). No diseñado, requiere conversación de alcance antes de tocar código.
- Deuda técnica menor: `supabase/functions/stripe-webhook/index.ts` duplica la lógica de `supabase/functions/_shared/createInvoice.ts` en vez de reusarla.

**Riesgos a no romper** (siguen vigentes si se vuelve a tocar esta zona):
- El importe del cargo por reprogramación se calcula con el horario **original**, no el nuevo.
- `invoice_on_payment_mode` debe respetarse (`=== 'auto'`) en cualquier generación automática de factura.
- Nunca usar `window.confirm()`/`alert()`/`prompt()` en páginas de reserva/portal/gestión de cita (se bloquean en el iframe cross-origin de WordPress) — usar `AlertDialog` con contenido inline.
- Radix `AlertDialog`: si el trigger no es un `AlertDialogTrigger` (un `Button` normal con `onClick={() => setOpen(true)}`), `onOpenChange` no se dispara para esa apertura — cualquier fetch al abrir debe ir en el mismo `onClick`.

---

## B. FOCO ACTUAL — Pasar Stripe a producción

### 1. Objetivo

Psycma ya cobra en **modo sandbox** (Stripe test + Connect test) para: pagos de sesión, pagos de bono, pagos de deuda, y el guardado de tarjeta (SetupIntent) para cargos de cancelación. El objetivo es activar **cobros reales** sin romper nada de lo que ya funciona en sandbox.

### 2. Dónde está el procedimiento

**El paso a paso ya existe y está completo:** [`docs/stripe-produccion-runbook.md`](docs/stripe-produccion-runbook.md). No hace falta rediseñarlo, hace falta **ejecutarlo**. Resumen de sus 9 secciones:

1. Checklist previo (sandbox verificado, accesos a mano, avisar ventana de mantenimiento).
2. Cambiar Stripe a modo producción (live) + confirmar perfil de plataforma Connect activo.
3. Sustituir secretos de Supabase por las claves **live** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_APPLICATION_FEE_BPS`).
4. Crear los 2 webhooks live en Stripe (plataforma + cuentas conectadas), mismo endpoint (`.../functions/v1/stripe-webhook`), eventos mínimos: `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, `payment_intent.payment_failed`, `account.updated`.
5. **Reconectar a cada profesional** en live (las cuentas conectadas de sandbox no pasan a producción) y confirmar pagos/transferencias habilitados.
6. Confirmar comisión de plataforma (`STRIPE_APPLICATION_FEE_BPS = 0` salvo decisión comercial distinta).
7. Verificación con dinero real: pago de sesión pequeño + pago de deuda/bono pequeño + reenvío de webhook (sin duplicar) + reembolso controlado.
8. Plan de rollback (restaurar secretos sandbox, deshabilitar webhooks live, revisar `stripe_webhook_events` / `integration_errors`).
9. Activación gradual por fases + AEAT/Verifactu en real solo cuando se vayan a emitir facturas reales (no mezclar certificados/credenciales sandbox y producción).

### 3. Estado conocido a fecha de hoy (2026-08-20)

Según la memoria del proyecto (sesión previa, 2026-08-13) — **verificar que sigue siendo así antes de fiarte, puede haber cambiado**:
- El cutover real a claves/webhooks de producción **no se ha hecho todavía** — sigue en sandbox.
- `STRIPE_APPLICATION_FEE_BPS = 0` decidido (Psycma no cobra comisión de plataforma).
- Ya existe un panel de diagnóstico Stripe en Ajustes → Conexiones (`useStripeDiagnostics`) — útil para comprobar el estado antes/después del cutover sin salir de la app.
- Frontend de Cobros (bruto/neto/reembolsos) ya verificado visualmente en sandbox.
- Área N (cargos de cancelación con tarjeta en archivo) es una fase posterior, **no es requisito** para el cutover de producción — su diseño está en `docs/area-N-cargos-cancelacion.md` si hace falta retomarlo.

### 4. Qué falta decidir/hacer antes de ejecutar el runbook

- [ ] Confirmar que el perfil de plataforma Stripe Connect está completo y aprobado para live (esto lo hace Stripe, puede tardar días si piden documentación).
- [ ] Decidir la ventana de mantenimiento (los pagos en curso pueden fallar durante el cambio de claves).
- [ ] Tener a mano el acceso a la consola de Stripe en modo producción y a los secretos de Supabase/Lovable.
- [ ] Avisar a los profesionales de que tendrán que reconectar su cuenta Stripe tras el cutover (paso 4 del runbook) — esto es visible para ellos, conviene comunicarlo antes.
- [ ] Decidir si el cutover se hace para todos los centros a la vez o por fases (el runbook recomienda por fases, sección 8).

### 5. Riesgos específicos de Stripe a no romper

- **No mezclar claves sandbox y live** en ningún secreto — revisar los 4 secretos (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_APPLICATION_FEE_BPS`) juntos, no uno a uno en sesiones distintas, para evitar un estado mixto.
- **Las cuentas conectadas de sandbox no sirven en live** — cada profesional necesita reconectar, si no los pagos fallarán silenciosamente al intentar transferir a una cuenta que no existe en live.
- **Verifactu/AEAT tiene su propio entorno real separado** — no activarlo a la vez que Stripe sin necesidad; solo cuando se vayan a emitir facturas reales de verdad (sección 9 del runbook).
- Guardar las claves sandbox en un sitio seguro antes de sustituirlas, por si hay que hacer rollback (sección 7 del runbook cubre esto).
- Lovable auto-commitea a `main` en segundo plano — `git fetch origin main` antes de cualquier push para evitar divergencia.

## 6. SIGUIENTE ACCIÓN INMEDIATA

Antes de tocar ningún secreto: comprobar el estado real actual (no fiarse solo de la memoria de la sesión del 13/08) —
1. Abrir Ajustes → Conexiones en Psycma y revisar el panel de diagnóstico Stripe (`useStripeDiagnostics`) para confirmar en qué modo está funcionando hoy.
2. Repasar la sección 0 del runbook (`docs/stripe-produccion-runbook.md`) y marcar qué faltaba de la lista de accesos/preparación.
3. Con eso claro, decidir fecha de la ventana de mantenimiento y empezar por la sección 1 del runbook (pasar Stripe a modo producción).
