
CREATE TABLE public.app_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_code text NOT NULL UNIQUE,
  version_name text NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  is_current boolean NOT NULL DEFAULT false,
  published_at timestamptz NULL,
  applies_to_verifactu boolean NOT NULL DEFAULT false,
  verifactu_synced_at timestamptz NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NULL,
  module text NOT NULL,
  change_type text NOT NULL
    CHECK (change_type IN ('feature','improvement','fix','technical',
                           'legal','security','ui')),
  affects_verifactu boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'included', 'archived')),
  version_id uuid NULL REFERENCES public.app_versions(id)
    ON DELETE SET NULL,
  created_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_versions_is_current_idx ON public.app_versions(is_current)
  WHERE is_current = true;
CREATE INDEX app_versions_status_idx ON public.app_versions(status);
CREATE INDEX app_change_log_status_idx ON public.app_change_log(status);
CREATE INDEX app_change_log_version_id_idx ON public.app_change_log(version_id);

ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage app_versions"
  ON public.app_versions FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can manage app_change_log"
  ON public.app_change_log FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.enforce_single_current_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_current = true THEN
    UPDATE public.app_versions
    SET is_current = false, updated_at = now()
    WHERE is_current = true AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_single_current_version_trigger
  BEFORE INSERT OR UPDATE ON public.app_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_current_version();

CREATE TRIGGER app_versions_updated_at
  BEFORE UPDATE ON public.app_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER app_change_log_updated_at
  BEFORE UPDATE ON public.app_change_log
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
