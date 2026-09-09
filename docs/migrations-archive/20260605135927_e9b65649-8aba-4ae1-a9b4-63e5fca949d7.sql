CREATE OR REPLACE FUNCTION public.protect_consent_anon_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    -- Anonymous token-based updates may only change completion/signature fields.
    -- Keep protected identity, ownership and document fields immutable from public links.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.requires_guardian IS DISTINCT FROM OLD.requires_guardian
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
       OR NEW.uploaded_file_url IS DISTINCT FROM OLD.uploaded_file_url
       OR NEW.source IS DISTINCT FROM OLD.source
    THEN
      RAISE EXCEPTION 'Anonymous updates can only modify signature/verification fields on consents';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;