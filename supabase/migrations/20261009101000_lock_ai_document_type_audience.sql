-- El envío al paciente (WhatsApp/email) se decide por ai_document_types.audience = 'patient'.
-- Esa audiencia se lee en vivo desde la plantilla, no se copia en ai_generated_documents, así
-- que cambiarla convertiría en "enviables" informes clínicos ya generados. Se bloquea el cambio
-- de audiencia en cuanto la plantilla tiene documentos generados.
CREATE OR REPLACE FUNCTION public.trg_lock_ai_document_type_audience()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.audience IS DISTINCT FROM OLD.audience
     AND EXISTS (SELECT 1 FROM public.ai_generated_documents WHERE document_type_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede cambiar el destinatario de una plantilla que ya tiene documentos generados. Crea una plantilla nueva.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_lock_ai_document_type_audience() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lock_ai_document_type_audience ON public.ai_document_types;
CREATE TRIGGER lock_ai_document_type_audience
  BEFORE UPDATE OF audience ON public.ai_document_types
  FOR EACH ROW EXECUTE FUNCTION public.trg_lock_ai_document_type_audience();
