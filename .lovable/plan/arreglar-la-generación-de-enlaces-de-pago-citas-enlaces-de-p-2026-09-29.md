# Arreglar la generación de enlaces de pago (citas, enlaces de pago y bonos)

## Causa (confirmada en los registros)
Desde que existe la tabla `session_participants` (sesiones de pareja), la base de datos tiene dos caminos para unir `sessions` con `patients`. Toda consulta que pide "la sesión con su paciente" sin indicar cuál falla con `PGRST201: Could not embed because more than one relationship was found for 'sessions' and 'patients'`. El error aparece literal en `process-advance-payment-deadlines`, y las funciones de pago usan el mismo patrón, por lo que fallan al leer la sesión y devuelven error antes de llamar a Stripe.

## Cambio
Indicar explícitamente la relación directa (`patients!sessions_patient_id_fkey`) en cada consulta que une sesiones con pacientes. Sin cambios de lógica ni de base de datos.

Funciones afectadas:
- `create-stripe-checkout` (enlace de pago al crear cita)
- `create-bono-checkout` (comprar bono desde el enlace)
- `create-debt-payment-checkout` (revisar la unión debts→sessions/patients)
- `process-advance-payment-deadlines` (cron de pago anticipado; error visible en logs)
- `send-payment-reminders`, `wasender-send-reminders`, `check-autoregistro-alerts` (mismo patrón; revisar y corregir si unen desde `sessions`)
- Barrido completo con búsqueda en `supabase/functions` y `src/` de otras consultas `sessions` → `patients` sin desambiguar (incluidos los hooks del frontend).

## Verificación
1. Desplegar las funciones modificadas.
2. Llamar a `create-stripe-checkout` y `create-bono-checkout` con una sesión real y confirmar que devuelven la URL de Stripe.
3. Revisar logs: sin `PGRST201`.
4. Crear una cita de prueba con pago obligatorio desde la agenda y abrir el enlace.
