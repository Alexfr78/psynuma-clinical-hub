# Firma de política de cancelación al reprogramar desde el enlace de cita

## Qué he comprobado (datos reales)

- Alberto De Tomás Calero (contacto creado el 16/01/2026) tiene su próxima cita el **08/09/2026 a las 17:00**, modificada el 31/08/2026 — la reprogramación funcionó.
- Esa sesión tiene `cancellation_policy_version_id` **vacío**, igual que todas sus sesiones anteriores.
- Sus 3 consentimientos firmados (enero y febrero de 2026) son consentimientos clínicos: **ninguno está vinculado a una versión de la política de cancelación**.
- El centro tiene la política activa **v5** (creada el 10/08/2026); las versiones v1–v4 son de junio/julio de 2026, es decir, posteriores al alta del contacto.

## Causa

No es un error de la reprogramación: es un hueco del flujo. La aceptación de la política (clickwrap) solo se registra en dos sitios:

- reserva pública nueva (`public-booking`)
- reserva desde el portal del contacto (`patient-portal-sessions`)

La función de reprogramación desde el enlace de cita (`public-session-reschedule`) **solo lee** si existe una política firmada para calcular un posible cargo; nunca la propone ni la registra. Como Alberto es un contacto antiguo que nunca reservó por esos dos canales, sigue sin política firmada aunque reprograme.

## Qué propongo construir

1. **Mostrar y pedir la política al reprogramar** en la página pública `/cita/:token`:
   - Antes de confirmar la nueva fecha, si el centro tiene la política activada y el contacto no ha aceptado la versión vigente, se muestra el resumen de la política (ventana de cancelación, % por cancelación tardía y no asistencia) con una casilla obligatoria de aceptación.
   - Si ya la tiene aceptada, no se muestra nada y el flujo queda igual que ahora.
2. **Registrar la aceptación en el backend** al confirmar la reprogramación, reutilizando el mismo mecanismo que ya usan reserva pública y portal (se crea un consentimiento firmado ligado a la versión exacta de la política, con IP, user-agent y fecha).
3. **Vincular la sesión** reprogramada a la versión de política aceptada, para que los cargos por cancelación futuros se calculen sobre la versión correcta.
4. **Contactos antiguos**: nada retroactivo. Alberto quedará con la política firmada la próxima vez que use el enlace de cita, o puedes enviársela ahora manualmente desde la ficha del contacto.

## Detalle técnico

- `supabase/functions/public-session-reschedule/index.ts`:
  - importar `getPublicCancellationPolicy`, `hasAcceptedCancellationPolicy` y `recordPortalCancellationPolicyClickwrap` de `_shared/cancellationPolicyClickwrap.ts`.
  - en la acción `validate`/carga inicial, devolver `cancellationPolicy` (texto y porcentajes) y `policyAlreadyAccepted`.
  - en la acción `reschedule`, aceptar `acceptedCancellationPolicyVersionId`; si el centro tiene `cancellation_policy_enabled` y no hay aceptación previa, rechazar la reprogramación con un error claro; si viene aceptada, llamar a `recordPortalCancellationPolicyClickwrap` (source `portal_booking_checkbox`) y actualizar `sessions.cancellation_policy_version_id`.
- `src/pages/SessionManagement.tsx`: nuevo bloque de política con checkbox obligatoria en el paso de confirmación de nueva fecha; el botón de confirmar queda deshabilitado hasta marcarla.
- Sin cambios de esquema: `consents.cancellation_policy_version_id` y `sessions.cancellation_policy_version_id` ya existen.
- Despliegue: redeploy de `public-session-reschedule` + publicación del frontend.
