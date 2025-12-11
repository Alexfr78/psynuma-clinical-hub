-- Create location_schedules table for independent schedules per location
CREATE TABLE public.location_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NOT NULL REFERENCES public.center_locations(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time without time zone NOT NULL DEFAULT '09:00',
  end_time time without time zone NOT NULL DEFAULT '21:00',
  is_open boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(location_id, day_of_week)
);

-- Enable RLS
ALTER TABLE public.location_schedules ENABLE ROW LEVEL SECURITY;

-- View policy
CREATE POLICY "View schedules in center" ON public.location_schedules
  FOR SELECT USING (
    location_id IN (
      SELECT id FROM public.center_locations WHERE center_id = get_user_center_id(auth.uid())
    )
  );

-- Manage policy
CREATE POLICY "Manage schedules in center" ON public.location_schedules
  FOR ALL USING (
    location_id IN (
      SELECT id FROM public.center_locations WHERE center_id = get_user_center_id(auth.uid())
    ) AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

-- Trigger for updated_at
CREATE TRIGGER update_location_schedules_updated_at
  BEFORE UPDATE ON public.location_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();