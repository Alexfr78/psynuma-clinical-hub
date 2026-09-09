-- Add 'draft' to session_status enum
ALTER TYPE public.session_status ADD VALUE IF NOT EXISTS 'draft' BEFORE 'scheduled';

-- Add room field to sessions table
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS room text;