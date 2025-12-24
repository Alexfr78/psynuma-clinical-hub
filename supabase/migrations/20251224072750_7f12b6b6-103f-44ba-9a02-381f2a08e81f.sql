-- 1. Crear tabla calendar_events para eventos importados de Google Calendar
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('google')),
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  google_event_id text NOT NULL,

  status text,
  summary text,
  description text,
  location text,

  start_at timestamptz,
  end_at timestamptz,
  all_day boolean DEFAULT false,

  updated_at_google timestamptz,
  etag text,
  deleted boolean DEFAULT false,

  raw jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (professional_id, provider, google_event_id)
);

-- Índice para consultas por profesional y rango de fechas
CREATE INDEX IF NOT EXISTS idx_calendar_events_professional_start
  ON public.calendar_events (professional_id, start_at);

CREATE INDEX IF NOT EXISTS idx_calendar_events_professional_range
  ON public.calendar_events (professional_id, start_at, end_at) WHERE deleted = false;

-- 2. Extender oauth_connections para watch + estado sync
ALTER TABLE public.oauth_connections
  ADD COLUMN IF NOT EXISTS sync_token text,
  ADD COLUMN IF NOT EXISTS watch_channel_id text,
  ADD COLUMN IF NOT EXISTS watch_resource_id text,
  ADD COLUMN IF NOT EXISTS watch_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_status text,
  ADD COLUMN IF NOT EXISTS needs_reconnect boolean DEFAULT false;

-- 3. RLS para calendar_events
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Profesionales pueden ver sus propios eventos
CREATE POLICY "Professionals can view their calendar events"
  ON public.calendar_events
  FOR SELECT
  USING (professional_id = auth.uid() OR is_admin(auth.uid()));

-- Profesionales pueden gestionar sus propios eventos
CREATE POLICY "Professionals can manage their calendar events"
  ON public.calendar_events
  FOR ALL
  USING (professional_id = auth.uid() OR is_admin(auth.uid()));

-- 4. Trigger para updated_at
CREATE OR REPLACE FUNCTION public.update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_calendar_events_updated_at();