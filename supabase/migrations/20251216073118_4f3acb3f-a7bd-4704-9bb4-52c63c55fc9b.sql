-- Add session reminder configuration to centers table
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS session_reminder_enabled boolean DEFAULT true;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS session_reminder_timing text DEFAULT '24_hours';
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS session_reminder_hours_before integer DEFAULT 24;
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS session_reminder_channels jsonb DEFAULT '{"email": true, "whatsapp": true, "sms": false}'::jsonb;

-- Add reminder tracking to sessions table
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN public.centers.session_reminder_timing IS 'Options: day_before_10am, 12_hours, 24_hours, 48_hours, custom_hours';
COMMENT ON COLUMN public.centers.session_reminder_channels IS 'JSON object with email, whatsapp, sms boolean flags';