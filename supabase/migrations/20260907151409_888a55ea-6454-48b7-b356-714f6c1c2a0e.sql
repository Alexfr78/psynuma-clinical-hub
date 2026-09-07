-- =====================================================================
-- Plantillas propias del profesional + predeterminadas por destinatario
-- =====================================================================

ALTER TABLE public.ai_document_types
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_document_types_professional_requires_center_chk'
  ) THEN
    ALTER TABLE public.ai_document_types
      ADD CONSTRAINT ai_document_types_professional_requires_center_chk
      CHECK (professional_id IS NULL OR center_id IS NOT NULL);
  END IF;
END;
$$;

DROP INDEX IF EXISTS ai_document_types_center_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS ai_document_types_scope_key_uidx
  ON public.ai_document_types (
    coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

CREATE TABLE IF NOT EXISTS public.ai_document_defaults (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience         text NOT NULL,
  document_type_id uuid NOT NULL REFERENCES public.ai_document_types(id) ON DELETE CASCADE,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.profiles(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_document_defaults_scope_uidx
  ON public.ai_document_defaults (
    center_id,
    coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    audience
  );

CREATE INDEX IF NOT EXISTS ai_document_defaults_document_type_idx
  ON public.ai_document_defaults (document_type_id);

DROP TRIGGER IF EXISTS update_ai_document_defaults_updated_at ON public.ai_document_defaults;
CREATE TRIGGER update_ai_document_defaults_updated_at
  BEFORE UPDATE ON public.ai_document_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_document_defaults TO authenticated;
GRANT ALL ON public.ai_document_defaults TO service_role;

ALTER TABLE public.ai_document_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View document types (system or own center)" ON public.ai_document_types;
DROP POLICY IF EXISTS "Admins manage document types in their center" ON public.ai_document_types;
DROP POLICY IF EXISTS "View document types (system, center or own)" ON public.ai_document_types;
DROP POLICY IF EXISTS "Admins manage center document types" ON public.ai_document_types;
DROP POLICY IF EXISTS "Professionals manage own document types" ON public.ai_document_types;

CREATE POLICY "View document types (system, center or own)"
  ON public.ai_document_types
  FOR SELECT
  USING (
    center_id IS NULL
    OR (
      center_id = public.get_user_center_id(auth.uid())
      AND (professional_id IS NULL OR professional_id = auth.uid())
    )
  );

CREATE POLICY "Admins manage center document types"
  ON public.ai_document_types
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id IS NULL
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id IS NULL
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Professionals manage own document types"
  ON public.ai_document_types
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id = auth.uid()
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id = auth.uid()
  );

DROP POLICY IF EXISTS "View document defaults in center" ON public.ai_document_defaults;
CREATE POLICY "View document defaults in center"
  ON public.ai_document_defaults
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

DROP POLICY IF EXISTS "Admins manage center document defaults" ON public.ai_document_defaults;
CREATE POLICY "Admins manage center document defaults"
  ON public.ai_document_defaults
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id IS NULL
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id IS NULL
    AND public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Professionals manage own document defaults" ON public.ai_document_defaults;
CREATE POLICY "Professionals manage own document defaults"
  ON public.ai_document_defaults
  FOR ALL
  USING (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id = auth.uid()
  )
  WITH CHECK (
    center_id = public.get_user_center_id(auth.uid())
    AND professional_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.seed_ai_document_defaults_for_center(p_center_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinical_report_id uuid;
  v_patient_report_id  uuid;
BEGIN
  SELECT id INTO v_clinical_report_id
    FROM public.ai_document_types WHERE center_id IS NULL AND key = 'clinical_report';
  SELECT id INTO v_patient_report_id
    FROM public.ai_document_types WHERE center_id IS NULL AND key = 'patient_report';

  IF v_clinical_report_id IS NOT NULL THEN
    INSERT INTO public.ai_document_defaults (center_id, professional_id, audience, document_type_id)
    VALUES (p_center_id, NULL, 'professional', v_clinical_report_id)
    ON CONFLICT (center_id, coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), audience)
    DO NOTHING;
  END IF;

  IF v_patient_report_id IS NOT NULL THEN
    INSERT INTO public.ai_document_defaults (center_id, professional_id, audience, document_type_id)
    VALUES (p_center_id, NULL, 'patient', v_patient_report_id)
    ON CONFLICT (center_id, coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid), audience)
    DO NOTHING;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_ai_document_defaults_for_center(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_seed_ai_document_defaults_for_new_center()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.seed_ai_document_defaults_for_center(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudieron sembrar las predeterminadas de documentos IA para el centro % (%): %',
      NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seed_ai_document_defaults_after_center_insert ON public.centers;
CREATE TRIGGER seed_ai_document_defaults_after_center_insert
  AFTER INSERT ON public.centers
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_ai_document_defaults_for_new_center();

DO $backfill$
DECLARE
  v_center record;
BEGIN
  FOR v_center IN SELECT id FROM public.centers LOOP
    PERFORM public.seed_ai_document_defaults_for_center(v_center.id);
  END LOOP;
END;
$backfill$ LANGUAGE plpgsql;