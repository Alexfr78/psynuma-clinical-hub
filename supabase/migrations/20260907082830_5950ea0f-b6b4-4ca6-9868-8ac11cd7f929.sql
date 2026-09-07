CREATE OR REPLACE FUNCTION public.prevent_published_prompt_version_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.is_published = true THEN
    IF NEW.user_prompt IS DISTINCT FROM OLD.user_prompt
      OR NEW.system_prompt IS DISTINCT FROM OLD.system_prompt
      OR NEW.model IS DISTINCT FROM OLD.model
      OR NEW.temperature IS DISTINCT FROM OLD.temperature
      OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
      OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
      OR NEW.document_type_id IS DISTINCT FROM OLD.document_type_id
      OR NEW.version IS DISTINCT FROM OLD.version
    THEN
      RAISE EXCEPTION 'No se puede modificar una versión de prompt ya publicada. Crea una nueva versión en su lugar.';
    END IF;

    IF NEW.is_published = false THEN
      RAISE EXCEPTION 'No se puede despublicar una versión de prompt. Publica otra versión para reemplazarla.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_ai_prompt_versions_for_center(uuid) FROM anon, authenticated;