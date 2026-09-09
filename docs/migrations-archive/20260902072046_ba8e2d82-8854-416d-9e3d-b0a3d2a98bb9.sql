ALTER TABLE public.availability
  ADD COLUMN IF NOT EXISTS session_type_id uuid REFERENCES public.session_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_availability_session_type_id ON public.availability(session_type_id);