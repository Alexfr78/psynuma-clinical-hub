-- Add reschedule configuration fields to centers table
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS reschedule_max_days integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS reschedule_slot_duration integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS reschedule_require_confirmation boolean DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN public.centers.reschedule_max_days IS 'Maximum number of days in the future a patient can reschedule to';
COMMENT ON COLUMN public.centers.reschedule_slot_duration IS 'Duration of time slots in minutes shown in reschedule calendar';
COMMENT ON COLUMN public.centers.reschedule_require_confirmation IS 'Whether to require double confirmation when rescheduling';