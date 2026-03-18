
-- Create enums
CREATE TYPE public.schedule_exception_scope AS ENUM ('center', 'professional');
CREATE TYPE public.schedule_exception_reason AS ENUM ('holiday', 'vacation', 'sick_leave', 'training', 'closure', 'other');

-- Create table
CREATE TABLE public.schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope public.schedule_exception_scope NOT NULL DEFAULT 'center',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT TRUE,
  start_time TIME,
  end_time TIME,
  reason_type public.schedule_exception_reason NOT NULL DEFAULT 'other',
  reason_label TEXT,
  notes TEXT,
  affects_booking BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT valid_scope CHECK (
    (scope = 'center' AND professional_id IS NULL) OR
    (scope = 'professional' AND professional_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.schedule_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "View schedule exceptions in center"
  ON public.schedule_exceptions FOR SELECT
  TO public
  USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage schedule exceptions in center"
  ON public.schedule_exceptions FOR ALL
  TO public
  USING (
    center_id = get_user_center_id(auth.uid())
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  )
  WITH CHECK (
    center_id = get_user_center_id(auth.uid())
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

-- Public read for portal/booking (anon needs to check exceptions)
CREATE POLICY "Public read schedule exceptions for booking"
  ON public.schedule_exceptions FOR SELECT
  TO anon
  USING (
    affects_booking = true
    AND center_id IN (
      SELECT id FROM public.centers WHERE public_booking_enabled = true OR portal_enabled = true
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_exceptions;
