-- Add new columns to sessions table
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS session_modality TEXT DEFAULT 'in_person',
ADD COLUMN IF NOT EXISTS video_call_link TEXT,
ADD COLUMN IF NOT EXISTS cancellation_policy TEXT DEFAULT '24_hours',
ADD COLUMN IF NOT EXISTS location_id UUID;

-- Create center_locations table
CREATE TABLE IF NOT EXISTS public.center_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street TEXT NOT NULL,
  number_details TEXT,
  city TEXT NOT NULL,
  postal_code TEXT,
  country TEXT DEFAULT 'España',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add foreign key constraint for location_id
ALTER TABLE public.sessions 
ADD CONSTRAINT sessions_location_id_fkey 
FOREIGN KEY (location_id) REFERENCES public.center_locations(id) ON DELETE SET NULL;

-- Enable RLS on center_locations
ALTER TABLE public.center_locations ENABLE ROW LEVEL SECURITY;

-- RLS policies for center_locations
CREATE POLICY "View locations in center" ON public.center_locations
FOR SELECT USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage locations in center" ON public.center_locations
FOR ALL USING (
  center_id = get_user_center_id(auth.uid()) 
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- Add trigger for updated_at
CREATE TRIGGER update_center_locations_updated_at
BEFORE UPDATE ON public.center_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();