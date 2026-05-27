
-- 1. CENTERS: revoke sensitive columns from authenticated/anon
REVOKE SELECT (
  openai_api_key_encrypted,
  gemini_api_key_encrypted,
  oauth_google_credentials,
  oauth_zoom_credentials,
  oauth_stripe_credentials,
  whatsapp_access_token,
  verifactu_certificate_base64,
  verifactu_certificate_password
) ON public.centers FROM authenticated, anon;

-- 2. CONSENTS: restrict anonymous updates to signature-only fields via trigger
CREATE OR REPLACE FUNCTION public.protect_consent_anon_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    -- Anonymous (token-based) updates can only touch signature/verification fields
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.content_snapshot IS DISTINCT FROM OLD.content_snapshot
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
       OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
       OR NEW.revoked_reason IS DISTINCT FROM OLD.revoked_reason
    THEN
      RAISE EXCEPTION 'Anonymous updates can only modify signature/verification fields on consents';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_consent_anon_update ON public.consents;
CREATE TRIGGER trg_protect_consent_anon_update
BEFORE UPDATE ON public.consents
FOR EACH ROW EXECUTE FUNCTION public.protect_consent_anon_update();

-- 3. SESSIONS: restrict anonymous updates to scheduling fields via trigger
CREATE OR REPLACE FUNCTION public.protect_session_anon_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    -- Only allow changes to: status, session_date, start_time, end_time,
    -- location_id, session_modality, patient_notes, updated_at,
    -- rescheduled_from_date, rescheduled_at, cancellation_reason,
    -- google_event_id (sync), confirmation fields
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
       OR NEW.price IS DISTINCT FROM OLD.price
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.bono_id IS DISTINCT FROM OLD.bono_id
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Anonymous updates cannot modify protected fields on sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_session_anon_update ON public.sessions;
CREATE TRIGGER trg_protect_session_anon_update
BEFORE UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.protect_session_anon_update();

-- 4. PATIENTS: drop unrestricted anon INSERT (edge functions use service_role)
DROP POLICY IF EXISTS "Portal can register patients" ON public.patients;

-- 5. STORAGE consent-documents: enforce folder/center ownership on write ops
DROP POLICY IF EXISTS "Professionals access consent documents" ON storage.objects;

CREATE POLICY "Read consent docs from own center"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'consent-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Insert consent docs into own center"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'consent-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Update consent docs in own center"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'consent-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Delete consent docs in own center"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'consent-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);
