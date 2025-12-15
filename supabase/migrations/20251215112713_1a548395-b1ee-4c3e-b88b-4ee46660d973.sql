-- Create table for Google Calendar webhook channels
CREATE TABLE public.google_calendar_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  expiration TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(professional_id, calendar_id)
);

-- Enable RLS
ALTER TABLE public.google_calendar_channels ENABLE ROW LEVEL SECURITY;

-- Only service role can access (edge functions)
CREATE POLICY "Service role manages channels" ON public.google_calendar_channels
  FOR ALL USING (true) WITH CHECK (true);

-- Create index for fast lookup by channel_id
CREATE INDEX idx_google_calendar_channels_channel_id ON public.google_calendar_channels(channel_id);