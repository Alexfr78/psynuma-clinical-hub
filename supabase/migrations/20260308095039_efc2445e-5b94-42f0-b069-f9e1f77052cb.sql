
-- Token extraction function for autoregistro
CREATE OR REPLACE FUNCTION public.get_autoregistro_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-autoregistro-token', '')
$$;

-- Templates table
CREATE TABLE public.autoregistro_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id),
  professional_id uuid NOT NULL REFERENCES public.profiles(id),
  name text NOT NULL,
  description text,
  fields jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.autoregistro_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own center templates"
ON public.autoregistro_templates FOR ALL
TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

-- Links table
CREATE TABLE public.autoregistro_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id),
  template_id uuid NOT NULL REFERENCES public.autoregistro_templates(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  professional_id uuid NOT NULL REFERENCES public.profiles(id),
  access_token text NOT NULL DEFAULT gen_random_uuid()::text,
  status text NOT NULL DEFAULT 'active',
  allow_multiple boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.autoregistro_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own center links"
ON public.autoregistro_links FOR ALL
TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Anon can read link by token"
ON public.autoregistro_links FOR SELECT
TO anon
USING (access_token = public.get_autoregistro_token() AND status = 'active');

CREATE UNIQUE INDEX autoregistro_links_access_token_idx ON public.autoregistro_links(access_token);

-- Entries table
CREATE TABLE public.autoregistro_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.autoregistro_links(id),
  center_id uuid NOT NULL REFERENCES public.centers(id),
  patient_id uuid NOT NULL REFERENCES public.patients(id),
  template_id uuid NOT NULL REFERENCES public.autoregistro_templates(id),
  values jsonb NOT NULL DEFAULT '{}',
  submitted_at timestamptz DEFAULT now()
);

ALTER TABLE public.autoregistro_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own center entries"
ON public.autoregistro_entries FOR SELECT
TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Anon can insert entries via token"
ON public.autoregistro_entries FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.autoregistro_links
    WHERE id = link_id
    AND access_token = public.get_autoregistro_token()
    AND status = 'active'
  )
);

-- Now create verify function (tables exist)
CREATE OR REPLACE FUNCTION public.verify_autoregistro_token(link_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.autoregistro_links
    WHERE access_token = public.get_autoregistro_token()
    AND id = link_uuid
    AND status = 'active'
    AND access_token IS NOT NULL
  )
$$;

-- Anon can read template by token (for rendering form)
CREATE POLICY "Anon can read template by token"
ON public.autoregistro_templates FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.autoregistro_links
    WHERE template_id = autoregistro_templates.id
    AND access_token = public.get_autoregistro_token()
    AND status = 'active'
  )
);
