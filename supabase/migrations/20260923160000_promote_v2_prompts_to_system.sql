-- ---------------------------------------------------------------------------
-- Los dos documentos v2 pasan a ser PLANTILLAS DEL SISTEMA.
--
-- Las migraciones 20260923110000 y 20260923140000 los crearon como plantillas propias
-- del centro, que convivían con las del sistema (las antiguas) y aparecían duplicadas
-- en Ajustes → Plantillas de documentos. Aquí se invierte: la estructura y el prompt
-- nuevos sustituyen a los globales, cada centro recibe una versión nueva publicada de
-- su prompt (para el centro que ya tenía una, la v2), y las plantillas propias del
-- centro desaparecen.
--
-- Los textos no se repiten aquí: se copian de las filas que ya están en la base de
-- datos, así no hay forma de que se transcriban mal. Por eso la migración es idempotente:
-- si vuelve a ejecutarse cuando las plantillas propias ya no existen, no hace nada.
--
-- Orden importante: los `ai_document_defaults` apuntan hoy a las plantillas propias del
-- centro. Se repuntan a las globales ANTES de borrarlas, porque esa FK borra en cascada
-- y la generación automática de informes se quedaría sin plantilla por defecto.
--
-- Los documentos ya generados no se tocan: conservan su markdown y su versión de prompt.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_source record;
  v_center record;
  v_next integer;
BEGIN

FOR v_source IN
  SELECT t.id AS center_type_id, t.key, t.label, t.description, t.sections,
         g.id AS global_id, v.system_prompt, v.user_prompt
    FROM public.ai_document_types t
    JOIN public.ai_document_types g
      ON g.key = t.key AND g.center_id IS NULL AND g.professional_id IS NULL
    JOIN LATERAL (
      SELECT pv.system_prompt, pv.user_prompt
        FROM public.ai_prompt_versions pv
       WHERE pv.document_type_id = t.id AND pv.is_published
       ORDER BY pv.version DESC
       LIMIT 1
    ) v ON true
   WHERE t.center_id IS NOT NULL
     AND t.professional_id IS NULL
     AND t.key IN ('patient_report', 'clinical_report')
LOOP

  -- 1. La plantilla del sistema adopta estructura, etiqueta y prompt nuevos.
  UPDATE public.ai_document_types
     SET label = v_source.label,
         description = v_source.description,
         requires = '{}'::text[],
         sections = v_source.sections,
         default_user_prompt = v_source.user_prompt,
         updated_at = now()
   WHERE id = v_source.global_id;

  -- 2. Versión nueva publicada del prompt para cada centro, numerada a continuación
  --    de la última suya sobre esa plantilla.
  FOR v_center IN SELECT id FROM public.centers LOOP
    SELECT coalesce(max(version), 0) + 1 INTO v_next
      FROM public.ai_prompt_versions
     WHERE document_type_id = v_source.global_id AND center_id = v_center.id;

    INSERT INTO public.ai_prompt_versions
      (document_type_id, center_id, professional_id, session_type_id, version,
       system_prompt, user_prompt, is_published)
    VALUES (v_source.global_id, v_center.id, NULL, NULL, v_next,
            v_source.system_prompt, v_source.user_prompt, true);
  END LOOP;

  -- 3. Los valores por defecto dejan de apuntar a la plantilla propia del centro.
  UPDATE public.ai_document_defaults
     SET document_type_id = v_source.global_id
   WHERE document_type_id = v_source.center_type_id;

END LOOP;

-- 4. Fuera las plantillas propias del centro; sus versiones de prompt caen en cascada.
--    Solo si ningún documento generado las referencia: esa FK no borra en cascada y
--    perder la trazabilidad de un informe ya emitido no compensa.
DELETE FROM public.ai_document_types t
 WHERE t.center_id IS NOT NULL
   AND t.professional_id IS NULL
   AND t.key IN ('patient_report', 'clinical_report')
   AND NOT EXISTS (
     SELECT 1 FROM public.ai_generated_documents d WHERE d.document_type_id = t.id
   );

END $$;
