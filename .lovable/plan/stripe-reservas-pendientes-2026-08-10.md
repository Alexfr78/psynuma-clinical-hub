# Flecos pendientes del sistema de reservas con Stripe

## Aplazado: devoluciones al cancelar una reserva pagada

No implementar durante el perfilado actual del flujo de reservas.

### Comportamiento actual

- Cancelar una cita marca la sesión como cancelada y envía las notificaciones.
- Si la política firmada aplica penalización, crea un cargo pendiente de revisión.
- El cobro original permanece pagado y Stripe no recibe ninguna orden de devolución.
- La opción `refund_mode: automatic` se guarda en la política, pero todavía no ejecuta reembolsos.
- El evento `charge.refunded` del webhook actualmente solo se registra; no concilia sesión, cobro, deuda ni factura.

### Implementación futura

1. Resolver el importe reembolsable según plazo, política firmada, excepciones y penalización.
2. Permitir devolución total, devolución parcial o vale, respetando la configuración del centro.
3. Crear el reembolso en la cuenta Stripe Connect correcta y usar una clave de idempotencia.
4. Evitar dobles devoluciones ante reintentos del usuario o del webhook.
5. Conciliar `sessions`, `payments`, `debts` y el estado del reembolso.
6. Rectificar o anular la factura cuando corresponda, manteniendo Verifactu coherente.
7. Informar al cliente del importe devuelto, medio y plazo estimado.
8. Mostrar al profesional un estado inequívoco: pendiente de revisión, devolución en curso, devuelto parcialmente, devuelto o convertido en vale.

### Criterios de aceptación

- Una cancelación dentro del plazo devuelve el importe configurado sin intervención manual cuando el modo sea automático.
- Una cancelación fuera de plazo conserva solo la penalización aplicable y devuelve el resto.
- Repetir la petición o el webhook no duplica reembolsos, vales ni rectificativas.
- El historial de cobros identifica claramente el pago original y cada devolución.
- La base de datos termina con el mismo estado que Stripe incluso si falla temporalmente el webhook.
