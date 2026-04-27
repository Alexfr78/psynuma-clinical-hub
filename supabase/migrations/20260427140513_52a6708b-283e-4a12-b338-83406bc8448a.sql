-- 1) Nueva columna para configurar el modo de conflictos en la sincronización two-way con Google Calendar
ALTER TABLE public.professional_integrations
  ADD COLUMN IF NOT EXISTS google_calendar_conflict_mode TEXT NOT NULL DEFAULT 'psycma_wins';

-- Restringir a valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'professional_integrations_conflict_mode_check'
  ) THEN
    ALTER TABLE public.professional_integrations
      ADD CONSTRAINT professional_integrations_conflict_mode_check
      CHECK (google_calendar_conflict_mode IN ('psycma_wins', 'safe_two_way', 'google_wins_legacy'));
  END IF;
END $$;

-- Por seguridad, desactivar la regla peligrosa para todos los profesionales que tenían two_way activo
UPDATE public.professional_integrations
SET google_calendar_conflict_mode = 'psycma_wins'
WHERE google_calendar_sync_mode = 'two_way';

COMMENT ON COLUMN public.professional_integrations.google_calendar_conflict_mode IS
  'Política de resolución de conflictos al sincronizar two-way con Google: psycma_wins (Psycma manda, recomendado), safe_two_way (acepta cambios pequeños y bloquea movimientos grandes), google_wins_legacy (Google sobrescribe Psycma, puede provocar pérdida de datos).';