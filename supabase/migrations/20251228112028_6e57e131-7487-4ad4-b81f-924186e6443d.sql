-- Admin/Professional alert settings (email notifications on key events)
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS admin_alerts_enabled boolean DEFAULT true;

ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS admin_alerts_emails text; 

ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS admin_alerts_events jsonb
DEFAULT '{
  "booking_created": true,
  "booking_cancelled": true,
  "booking_rescheduled": true,
  "payment_online": true,
  "assessment_completed": true,
  "portal_cancelled": true,
  "portal_created": true
}'::jsonb;

ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS admin_alerts_include_professional boolean DEFAULT true;