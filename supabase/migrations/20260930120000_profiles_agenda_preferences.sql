-- Preferencias de visualización de la agenda por usuario (qué indicadores se
-- muestran en las tarjetas de cita). Se guarda en el perfil para que la
-- selección viaje entre dispositivos. La política "Users can update their own
-- profile" ya permite que cada usuario la edite.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS agenda_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_agenda_preferences_is_object;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_agenda_preferences_is_object
  CHECK (jsonb_typeof(agenda_preferences) = 'object');
