-- Add reschedule_requested value to session_status enum
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'reschedule_requested';