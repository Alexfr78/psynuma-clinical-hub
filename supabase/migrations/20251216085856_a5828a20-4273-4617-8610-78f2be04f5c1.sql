-- Add verifactu_auto_enabled to centers table
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS verifactu_auto_enabled boolean DEFAULT false;