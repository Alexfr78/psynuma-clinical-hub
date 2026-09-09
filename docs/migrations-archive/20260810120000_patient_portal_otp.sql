-- Passwordless patient portal access using short-lived, single-use OTP codes.
CREATE TABLE IF NOT EXISTS public.patient_portal_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_portal_otp_patient_created_idx
  ON public.patient_portal_otp_codes(patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS patient_portal_otp_expiry_idx
  ON public.patient_portal_otp_codes(expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.patient_portal_otp_codes ENABLE ROW LEVEL SECURITY;

-- OTP rows are intentionally service-role only. Public clients must use the
-- patient-portal-otp Edge Function so hashes and patient identifiers never leak.
REVOKE ALL ON TABLE public.patient_portal_otp_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.patient_portal_otp_codes TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_portal_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') LIKE '00%'
      THEN substr(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), 3)
    WHEN regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') ~ '^[67][0-9]{8}$'
      THEN '34' || regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
    ELSE regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
  END;
$$;

REVOKE ALL ON FUNCTION public.normalize_portal_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_portal_phone(text) TO service_role;

-- Returns up to two rows so the Edge Function can reject ambiguous shared
-- telephone/email matches instead of authenticating the wrong patient.
CREATE OR REPLACE FUNCTION public.find_portal_patient_by_identifier(
  p_center_id uuid,
  p_identifier text,
  p_channel text
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  email text,
  phone text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone
  FROM public.patients p
  WHERE p.center_id = p_center_id
    AND coalesce(p.status::text, 'active') <> 'archived'
    AND (
      (p_channel = 'email' AND lower(trim(coalesce(p.email, ''))) = lower(trim(p_identifier)))
      OR
      (p_channel = 'whatsapp' AND public.normalize_portal_phone(p.phone) = public.normalize_portal_phone(p_identifier))
    )
  ORDER BY p.created_at
  LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.find_portal_patient_by_identifier(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_portal_patient_by_identifier(uuid, text, text)
  TO service_role;
