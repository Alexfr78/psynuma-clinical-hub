-- Create session_types table
CREATE TABLE public.session_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC NOT NULL DEFAULT 60,
  commission_rate NUMERIC DEFAULT 0,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "View session types in center" ON public.session_types
  FOR SELECT USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage session types in center" ON public.session_types
  FOR ALL USING (
    center_id = get_user_center_id(auth.uid()) 
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

-- Trigger for updated_at
CREATE TRIGGER update_session_types_updated_at
  BEFORE UPDATE ON public.session_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default session types for existing centers
INSERT INTO public.session_types (center_id, name, default_price, duration_minutes, color)
SELECT id, 'Individual', 60, 60, '#3B82F6' FROM public.centers
UNION ALL
SELECT id, 'Pareja', 80, 75, '#22C55E' FROM public.centers
UNION ALL
SELECT id, 'Familiar', 100, 90, '#F59E0B' FROM public.centers
UNION ALL
SELECT id, 'Grupo', 40, 90, '#EF4444' FROM public.centers;