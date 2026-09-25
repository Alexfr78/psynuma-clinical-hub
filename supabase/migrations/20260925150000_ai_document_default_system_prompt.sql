-- ---------------------------------------------------------------------------
-- Prompt de sistema por defecto en las plantillas de documentos IA.
--
-- Los prompts de sistema clínicos (informe clínico e informe al paciente) solo existían
-- dentro de las versiones de prompt de cada centro. Un centro creado después de
-- promocionarlos recibía, al sembrarse, el `ai_prompt_system` del centro (NULL en un centro
-- nuevo) y generaba esos informes con el prompt de sistema genérico del código.
--
-- 1. `ai_document_types.default_system_prompt`: el prompt de sistema semilla de la
--    plantilla. Se rellena para las dos plantillas que tienen uno propio copiándolo de las
--    versiones publicadas (es el mismo en todos los centros), para no transcribirlo.
-- 2. `seed_ai_prompt_versions_for_center` usa ese prompt de sistema, y como prompt de
--    usuario siempre el semilla de la plantilla: los antiguos `ai_prompt_layer1/2/3` del
--    centro son del sistema de "3 capas" y ya no corresponden a los prompts vigentes.
-- ---------------------------------------------------------------------------

ALTER TABLE public.ai_document_types
  ADD COLUMN IF NOT EXISTS default_system_prompt text;

UPDATE public.ai_document_types g
   SET default_system_prompt = s.system_prompt,
       updated_at = now()
  FROM (
    SELECT DISTINCT ON (document_type_id) document_type_id, system_prompt
      FROM public.ai_prompt_versions
     WHERE professional_id IS NULL AND session_type_id IS NULL
       AND is_published AND system_prompt IS NOT NULL
     ORDER BY document_type_id, version DESC
  ) s
 WHERE s.document_type_id = g.id
   AND g.key IN ('clinical_report', 'patient_report')
   AND g.center_id IS NULL AND g.professional_id IS NULL
   AND g.default_system_prompt IS NULL;

CREATE OR REPLACE FUNCTION public.seed_ai_prompt_versions_for_center(p_center_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ai_prompt_system text;
BEGIN
  SELECT c.ai_prompt_system
  INTO v_ai_prompt_system
  FROM public.centers c
  WHERE c.id = p_center_id;

  INSERT INTO public.ai_prompt_versions
    (document_type_id, center_id, version, system_prompt, user_prompt, professional_id, session_type_id, is_published)
  SELECT
    dt.id,
    p_center_id,
    1,
    coalesce(dt.default_system_prompt, v_ai_prompt_system),
    dt.default_user_prompt,
    NULL,
    NULL,
    true
  FROM public.ai_document_types dt
  WHERE dt.center_id IS NULL
    AND dt.is_active = true
    AND dt.default_user_prompt IS NOT NULL
  ON CONFLICT (document_type_id, center_id, version) DO NOTHING;
END;
$function$;
