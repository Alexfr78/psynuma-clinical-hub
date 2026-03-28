
CREATE TABLE public.emotional_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  record_date date NOT NULL DEFAULT CURRENT_DATE,
  primary_emotion text NOT NULL,
  secondary_emotion text NOT NULL,
  detailed_emotion text,
  intensity integer NOT NULL,
  note text,
  context text,
  thought text,
  reaction text,
  need text,
  helpful_action text
);

ALTER TABLE public.emotional_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals can manage emotional records for their center"
  ON public.emotional_records
  FOR ALL
  TO authenticated
  USING (center_id = public.get_user_center_id(auth.uid()))
  WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

CREATE INDEX idx_emotional_records_patient ON public.emotional_records(patient_id);
CREATE INDEX idx_emotional_records_date ON public.emotional_records(record_date);
