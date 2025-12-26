-- Create assessment_status enum
CREATE TYPE assessment_status AS ENUM ('pending', 'completed', 'expired', 'revoked');

-- Create assessment_templates table
CREATE TABLE public.assessment_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  items JSONB NOT NULL,
  scoring JSONB NOT NULL,
  instructions TEXT,
  interpretations JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(center_id, code)
);

-- Create assessments table
CREATE TABLE public.assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.assessment_templates(id) ON DELETE RESTRICT,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status assessment_status NOT NULL DEFAULT 'pending',
  access_token TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  sent_via TEXT,
  sent_to TEXT,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create assessment_responses table
CREATE TABLE public.assessment_responses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  answers JSONB NOT NULL,
  factor_scores JSONB NOT NULL,
  flags JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assessment_id)
);

-- Enable RLS
ALTER TABLE public.assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_responses ENABLE ROW LEVEL SECURITY;

-- Helper function to get assessment token from header
CREATE OR REPLACE FUNCTION public.get_assessment_token()
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-assessment-token', '')
$$;

-- Verify assessment token
CREATE OR REPLACE FUNCTION public.verify_assessment_token(assessment_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND id = assessment_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Verify assessment token for patient
CREATE OR REPLACE FUNCTION public.verify_assessment_token_for_patient(patient_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Verify assessment token for template
CREATE OR REPLACE FUNCTION public.verify_assessment_token_for_template(template_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.assessments
    WHERE access_token = public.get_assessment_token()
    AND template_id = template_uuid
    AND access_token IS NOT NULL
  )
$$;

-- RLS Policies for assessment_templates
CREATE POLICY "Users can view templates from their center"
ON public.assessment_templates FOR SELECT
USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins can manage templates"
ON public.assessment_templates FOR ALL
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "Professionals can create templates"
ON public.assessment_templates FOR INSERT
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_professional(auth.uid()));

CREATE POLICY "Public can view template via token"
ON public.assessment_templates FOR SELECT
USING (public.verify_assessment_token_for_template(id));

-- RLS Policies for assessments
CREATE POLICY "Users can view assessments from their center"
ON public.assessments FOR SELECT
USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Professionals can create assessments"
ON public.assessments FOR INSERT
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_professional(auth.uid()));

CREATE POLICY "Professionals can update assessments"
ON public.assessments FOR UPDATE
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_professional(auth.uid()));

CREATE POLICY "Public can view assessment via token"
ON public.assessments FOR SELECT
USING (
  access_token = public.get_assessment_token()
  AND status = 'pending'
  AND expires_at > now()
);

-- RLS Policies for assessment_responses
CREATE POLICY "Users can view responses from their center"
ON public.assessment_responses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_id
    AND a.center_id = public.get_user_center_id(auth.uid())
  )
);

CREATE POLICY "Service role can insert responses"
ON public.assessment_responses FOR INSERT
WITH CHECK (true);

-- Update triggers
CREATE TRIGGER update_assessment_templates_updated_at
BEFORE UPDATE ON public.assessment_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assessments_updated_at
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();