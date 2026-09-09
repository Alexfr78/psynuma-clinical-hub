-- Add is_public to session_types for public booking visibility
ALTER TABLE public.session_types 
ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT true;

-- Add public_booking_enabled to centers for enabling public booking
ALTER TABLE public.centers 
ADD COLUMN IF NOT EXISTS public_booking_enabled boolean DEFAULT false;

-- Add index for faster queries on public session types
CREATE INDEX IF NOT EXISTS idx_session_types_is_public 
ON public.session_types(center_id, is_public) 
WHERE is_public = true AND is_active = true;