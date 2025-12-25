-- Clean up existing duplicates: Mark calendar_events that correspond to Psycma sessions as converted
-- This is a one-time cleanup to fix duplicates created before the fix was implemented

-- Update calendar_events that have a matching google_event_id in sessions table
-- Mark them as is_converted=true so they don't appear as external blocks in the Agenda
UPDATE calendar_events ce
SET 
  is_converted = true,
  converted_session_id = s.id,
  converted_at = NOW()
FROM sessions s
WHERE ce.provider = 'google'
  AND ce.google_event_id = s.google_calendar_event_id
  AND ce.professional_id = s.professional_id
  AND ce.deleted = false
  AND (ce.is_converted = false OR ce.is_converted IS NULL);

-- Log how many were updated for reference
-- (This comment serves as documentation since we can't SELECT in a migration)