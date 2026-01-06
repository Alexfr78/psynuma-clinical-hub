-- =====================================================
-- RECURRING APPOINTMENTS SYSTEM
-- =====================================================

-- 1. Create recurring_series table
CREATE TABLE public.recurring_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id),
  
  -- Base appointment configuration
  base_start_datetime TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  timezone TEXT NOT NULL DEFAULT 'Europe/Madrid',
  session_type TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  session_modality TEXT DEFAULT 'in_person',
  location_id UUID REFERENCES public.center_locations(id),
  cancellation_policy TEXT DEFAULT '24_hours',
  notes_default TEXT,
  bono_id UUID REFERENCES public.bonos(id),
  
  -- Recurrence rule (JSON structure)
  -- { freq: 'DAILY'|'WEEKLY'|'MONTHLY', interval: number, byweekday?: string[], end_type: 'count'|'until_date', count?: number, until_date?: string }
  rrule_json JSONB NOT NULL,
  
  -- Generation control
  max_occurrences INTEGER DEFAULT 50,
  last_generated_until DATE,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add recurring fields to sessions table
ALTER TABLE public.sessions 
  ADD COLUMN IF NOT EXISTS recurring_series_id UUID REFERENCES public.recurring_series(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occurrence_index INTEGER,
  ADD COLUMN IF NOT EXISTS is_exception BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_start_datetime TIMESTAMPTZ;

-- 3. Create indexes
CREATE INDEX idx_sessions_recurring_series ON public.sessions(recurring_series_id) WHERE recurring_series_id IS NOT NULL;
CREATE UNIQUE INDEX idx_sessions_series_occurrence ON public.sessions(recurring_series_id, occurrence_index) WHERE recurring_series_id IS NOT NULL;
CREATE INDEX idx_recurring_series_center ON public.recurring_series(center_id);
CREATE INDEX idx_recurring_series_patient ON public.recurring_series(patient_id);
CREATE INDEX idx_recurring_series_professional ON public.recurring_series(professional_id);
CREATE INDEX idx_recurring_series_active ON public.recurring_series(is_active) WHERE is_active = true;

-- 4. Enable RLS
ALTER TABLE public.recurring_series ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies (same pattern as sessions)
CREATE POLICY "Users can view recurring series in their center"
  ON public.recurring_series
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Professionals can manage recurring series in their center"
  ON public.recurring_series
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

-- 6. Updated_at trigger
CREATE TRIGGER update_recurring_series_updated_at
  BEFORE UPDATE ON public.recurring_series
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();