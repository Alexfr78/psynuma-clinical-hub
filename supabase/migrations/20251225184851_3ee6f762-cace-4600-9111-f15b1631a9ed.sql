-- Add column to control weekend visibility in agenda
ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS agenda_show_weekends boolean DEFAULT true;