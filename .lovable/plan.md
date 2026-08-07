# Recuperar y asegurar los pagos de citas por Stripe

## Diagnóstico confirmado

- La cita de hoy a las **18:00** se creó con importe de **75 €** y Checkout `cs_test_a1ze…`.
- El Checkout se generó correctamente, pero la cita continúa como **programada / pago pendiente**.
- No existe para esa cita ningún cobro, deuda liquidada ni factura.
- El backend no recibió un nuevo evento de Stripe: el último webhook registrado sigue siendo el de la prueba anterior de las 17:21. El fallo está entre la entrega de Stripe y el webhook, antes de ejecutar la actualización local.

## Implementación

1. **Recuperar el pago actual de forma segura**
   - Consultar el Checkout directamente en Stripe dentro del contexto de la cuenta conectada.
   - Solo si Stripe confirma que está pagado, reutilizar el procesamiento idempotente del webhook para registrar el cobro, confirmar la cita, liquidar su deuda si existe y generar la factura cuando la configuración del centro sea automática.
   - No crear registros si Stripe no confirma el pago.

2. **Añadir conciliación automática como respaldo**
   - Crear una función protegida que localice citas con Checkout en estado pendiente, consulte su estado real en Stripe y procese únicamente las que consten pagadas.
   - Ejecutarla periódicamente para cubrir webhooks ausentes o entregas interrumpidas.
   - Mantener la idempotencia por ID de Checkout para impedir cobros o facturas duplicados si posteriormente llega el webhook original.

3. **Reforzar el webhook y el diagnóstico**
   - Mantener la validación de firma y el contexto de cuenta conectada.
   - Registrar de forma no sensible el ID de evento, Checkout, cuenta, resultado y causa del fallo.
   - Verificar que el endpoint de Connect configurado por Stripe apunta al webhook desplegado y acepta `checkout.session.completed`.

4. **Validación final**
   - Confirmar en la base de datos que la cita de las 18:00 queda pagada y confirmada, aparece un único cobro de 75 € y se genera una única factura si el centro tiene facturación automática activa.
   - Simular una repetición del evento y una conciliación posterior para comprobar que no se duplican cobro, deuda ni factura.

## Detalles técnicos

- Se extraerá el procesamiento común de `stripe-webhook` para reutilizarlo desde la conciliación.
- La función de conciliación será solo de backend y requerirá autenticación de tarea programada.
- Las actualizaciones relacionadas se realizarán como una operación coherente y reintentable; una ejecución parcial quedará registrada para un nuevo intento.
