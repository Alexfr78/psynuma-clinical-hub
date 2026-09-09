BEGIN;

-- ============================================================================
-- Interruptor de Política de Cancelaciones (Fase 1)
-- ----------------------------------------------------------------------------
-- Dos niveles de control:
--   1. centers.cancellation_policy_enabled  -> interruptor MAESTRO del centro.
--      OFF desactiva por completo la maquinaria de política (aceptación en
--      reservas, indicadores en sesiones y cargos por cancelación/no-show).
--   2. patients.cancellation_policy_enabled -> override POR PACIENTE, sólo
--      relevante cuando el maestro está ON.
--
-- Regla efectiva:
--   aplica(paciente) = centro.cancellation_policy_enabled
--                      AND coalesce(paciente.cancellation_policy_enabled, true)
-- ============================================================================

-- Centro: los centros NUEVOS nacen desactivados (opt-in); los EXISTENTES se
-- backfillean a activado para preservar el comportamiento actual.
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS cancellation_policy_enabled boolean NOT NULL DEFAULT false;

UPDATE public.centers SET cancellation_policy_enabled = true;

COMMENT ON COLUMN public.centers.cancellation_policy_enabled IS
  'Interruptor maestro de la política de cancelaciones del centro. OFF oculta y desactiva aceptación en reservas, indicadores de sesión y cargos.';

-- Paciente: por defecto la política aplica (true) cuando el maestro está ON.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS cancellation_policy_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.patients.cancellation_policy_enabled IS
  'Override por paciente de la política de cancelaciones. Sólo se tiene en cuenta cuando el interruptor maestro del centro está activo.';

COMMIT;
