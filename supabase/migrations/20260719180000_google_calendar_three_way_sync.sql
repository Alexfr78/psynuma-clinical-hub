-- Durable common ancestor for fail-safe, three-way Google Calendar sync.
CREATE TABLE IF NOT EXISTS public.google_session_sync_state (
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_event_id text NOT NULL,
  baseline_date date NOT NULL,
  baseline_start time NOT NULL,
  baseline_end time NOT NULL,
  google_etag text,
  google_updated_at timestamptz,
  status text NOT NULL DEFAULT 'synced'
    CHECK (status IN ('synced', 'conflict', 'error')),
  conflict_payload jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS google_session_sync_state_professional_event_idx
  ON public.google_session_sync_state(professional_id, google_event_id);

ALTER TABLE public.google_session_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.google_session_sync_state FROM anon, authenticated;
GRANT ALL ON TABLE public.google_session_sync_state TO service_role;

-- Existing linked sessions start with Psycma's current schedule as their common
-- ancestor. The first later change made in either system is therefore detectable.
INSERT INTO public.google_session_sync_state (
  session_id,
  professional_id,
  google_event_id,
  baseline_date,
  baseline_start,
  baseline_end
)
SELECT
  id,
  professional_id,
  google_calendar_event_id,
  session_date,
  start_time,
  end_time
FROM public.sessions
WHERE google_calendar_event_id IS NOT NULL
ON CONFLICT (session_id) DO NOTHING;

COMMENT ON TABLE public.google_session_sync_state IS
  'Last schedule confirmed by both Psycma and Google; used for three-way conflict detection.';
