-- =====================================================================
-- Plantillas propias del profesional + predeterminadas por destinatario
-- =====================================================================
-- Continúa el trabajo de 20260907082736_*.sql / 20260907082830_*.sql
-- (YA APLICADAS EN PRODUCCIÓN, no se tocan). Este fichero solo añade:
--
--  * ai_document_types.professional_id: permite que un profesional tenga
--    plantillas propias, no visibles ni editables por otros profesionales
--    del mismo centro. Sustituye el índice único de (center_id, key) por
--    uno que también incluya professional_id, con el mismo truco de
--    coalesce sobre un UUID "cero" para tolerar NULL (system / centro).
--
--  * ai_document_defaults: la plantilla predeterminada NO es una lista
--    plana, es "una plantilla por destinatario" (professional / patient),
--    con una fila opcional por profesional que prevalece sobre la del
--    centro solo para él. Unicidad con el mismo truco de coalesce.
--
--  * Semilla de las predeterminadas de centro (clinical_report /
--    patient_report, que es el comportamiento de hoy) y un trigger de
--    siembra para centros nuevos con el mismo patrón tolerante a fallos
--    que trg_seed_ai_prompt_versions_for_new_center: si la siembra falla,
--    se registra un WARNING pero no se aborta la creación del centro
--    (se crea en el primer login, vía CenterSetupWizard).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1.1 Plantillas propias del profesional
-- ---------------------------------------------------------------------

ALTER TABLE public.ai_document_types
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Una plantilla propia de un profesional exige que tenga centro: no tiene
-- sentido un professional_id sin center_id (no hay "profesional de sistema").
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

-- Sustituye el índice único anterior (center_id, key) por uno que también
-- distingue por professional_id, para poder tener a la vez una plantilla
-- de centro y una propia del profesional con la misma key.
DROP INDEX IF EXISTS ai_document_types_center_key_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS ai_document_types_scope_key_uidx
  ON public.ai_document_types (
    coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid),
    key
  );

-- ---------------------------------------------------------------------
-- 1.2 Predeterminadas por destinatario
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_document_defaults (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id        uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience         text NOT NULL,
  document_type_id uuid NOT NULL REFERENCES public.ai_document_types(id) ON DELETE CASCADE,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid REFERENCES public.profiles(id)
);

-- Una sola predeterminada por (centro, profesional o comodín, destinatario).
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

-- GRANT imprescindible: en este proyecto las tablas nuevas no tienen
-- permisos por defecto para la API (sin esto, PostgREST rechaza el acceso).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_document_defaults TO authenticated;
GRANT ALL ON public.ai_document_defaults TO service_role;

ALTER TABLE public.ai_document_defaults ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 1.3 RLS: sustituye las políticas de ai_document_types de la migración
-- anterior (DROP POLICY IF EXISTS antes de recrear, tanto las que se
-- reemplazan como las nuevas: la migración anterior no lo hacía y eso
-- ya dio problemas).
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "View document types (system or own center)" ON public.ai_document_types;
DROP POLICY IF EXISTS "Admins manage document types in their center" ON public.ai_document_types;
DROP POLICY IF EXISTS "View document types (system, center or own)" ON public.ai_document_types;
DROP POLICY IF EXISTS "Admins manage center document types" ON public.ai_document_types;
DROP POLICY IF EXISTS "Professionals manage own document types" ON public.ai_document_types;

-- SELECT: de sistema (visibles siempre), del centro (professional_id NULL,
-- visibles a todo el centro) o propias (professional_id = auth.uid()).
-- Un profesional NUNCA ve professional_id de OTRO profesional: la única
-- vía de acceso a una fila con professional_id no nulo es que coincida
-- con auth.uid(), así que las privadas de otros quedan fuera sin más.
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

-- INSERT/UPDATE/DELETE: el admin gestiona las plantillas de CENTRO
-- (professional_id IS NULL); las de sistema (center_id IS NULL) no las
-- puede escribir nadie desde el cliente, ninguna política las cubre.
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

-- INSERT/UPDATE/DELETE: un profesional gestiona únicamente sus propias
-- plantillas (professional_id = auth.uid()), nunca las de otro profesional
-- ni las de centro.
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

-- ai_document_defaults: todo el centro puede ver las predeterminadas
-- (necesario para que "Generar automáticamente" resuelva qué plantillas
-- usar, sea quien sea quien las fijó).
DROP POLICY IF EXISTS "View document defaults in center" ON public.ai_document_defaults;
CREATE POLICY "View document defaults in center"
  ON public.ai_document_defaults
  FOR SELECT
  USING (center_id = public.get_user_center_id(auth.uid()));

-- El admin fija/edita/borra la predeterminada de CENTRO (professional_id
-- IS NULL); un profesional solo la suya (professional_id = auth.uid()).
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

-- ---------------------------------------------------------------------
-- Semilla por centro existente + trigger para centros nuevos
-- ---------------------------------------------------------------------

-- Crea, si no existen ya, las predeterminadas de CENTRO (professional_id
-- NULL) para 'professional' -> clinical_report y 'patient' -> patient_report,
-- que es exactamente el comportamiento de hoy (las plantillas de sistema
-- de referencia). Se apoya en las plantillas de sistema (center_id IS NULL)
-- porque en el momento de la siembra el centro puede no tener aún copias
-- propias de esas plantillas.
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

-- El seed no debe ser invocable directamente desde el cliente (igual que
-- seed_ai_prompt_versions_for_center en la migración anterior).
REVOKE EXECUTE ON FUNCTION public.seed_ai_document_defaults_for_center(uuid) FROM anon, authenticated;

-- Trigger para centros nuevos: mismo patrón tolerante a fallos que
-- trg_seed_ai_prompt_versions_for_new_center. Un fallo aquí no puede
-- impedir crear el centro (se crea en el primer login).
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

-- Backfill: sembrar las predeterminadas de centro para todos los centros
-- existentes. Idempotente vía ON CONFLICT DO NOTHING dentro de la función.
DO $backfill$
DECLARE
  v_center record;
BEGIN
  FOR v_center IN SELECT id FROM public.centers LOOP
    PERFORM public.seed_ai_document_defaults_for_center(v_center.id);
  END LOOP;
END;
$backfill$ LANGUAGE plpgsql;
