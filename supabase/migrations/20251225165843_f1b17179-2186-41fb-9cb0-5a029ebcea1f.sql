-- ============================================
-- CRITICAL SECURITY FIX: Multi-tenant isolation
-- ============================================

-- 1. Create helper function to get consent token from request header
CREATE OR REPLACE FUNCTION public.get_consent_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-consent-token', '')
$$;

-- 2. Create verification function for consent token
CREATE OR REPLACE FUNCTION public.verify_consent_token(consent_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND id = consent_uuid
    AND access_token IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_patient(patient_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_template(template_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND template_id = template_uuid
    AND access_token IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.verify_consent_token_for_professional(professional_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents
    WHERE access_token = public.get_consent_token()
    AND professional_id = professional_uuid
    AND access_token IS NOT NULL
  )
$$;

-- ============================================
-- DROP ALL DANGEROUS PUBLIC POLICIES
-- ============================================

-- Invoices - drop overly permissive policies
DROP POLICY IF EXISTS "Public read invoice by access_token" ON public.invoices;
DROP POLICY IF EXISTS "Public read invoice items by token" ON public.invoice_items;

-- Sessions - drop overly permissive policies  
DROP POLICY IF EXISTS "Public read access by token" ON public.sessions;
DROP POLICY IF EXISTS "Public update session by token" ON public.sessions;

-- Patients - drop overly permissive policies
DROP POLICY IF EXISTS "Public read patient by invoice token" ON public.patients;
DROP POLICY IF EXISTS "Public read patient by session token" ON public.patients;

-- Centers - drop overly permissive policies
DROP POLICY IF EXISTS "Public read center by invoice token" ON public.centers;
DROP POLICY IF EXISTS "Public read center by session token" ON public.centers;

-- Consents - drop overly permissive policies
DROP POLICY IF EXISTS "Public read consent by token" ON public.consents;
DROP POLICY IF EXISTS "Public update consent by token" ON public.consents;

-- Consent signatures - drop overly permissive policies
DROP POLICY IF EXISTS "Public insert signature by consent token" ON public.consent_signatures;
DROP POLICY IF EXISTS "Public read signatures by consent token" ON public.consent_signatures;

-- Consent templates - drop overly permissive policies
DROP POLICY IF EXISTS "Public read template by consent token" ON public.consent_templates;

-- Center locations - drop overly permissive policies
DROP POLICY IF EXISTS "Public read location by session token" ON public.center_locations;

-- Profiles - drop overly permissive policies
DROP POLICY IF EXISTS "Public read professional by session token" ON public.profiles;
DROP POLICY IF EXISTS "Public read professional by consent token" ON public.profiles;

-- Patient magic links - drop ALL public policies (critical security)
DROP POLICY IF EXISTS "Public insert magic link" ON public.patient_magic_links;
DROP POLICY IF EXISTS "Public read magic link by token" ON public.patient_magic_links;
DROP POLICY IF EXISTS "Public update magic link by token" ON public.patient_magic_links;

-- ============================================
-- RECREATE SECURE PUBLIC POLICIES (TO anon only, with token validation)
-- ============================================

-- Invoices: Public access only with valid x-invoice-token header
CREATE POLICY "Anon read invoice by valid token"
ON public.invoices
FOR SELECT
TO anon
USING (
  access_token IS NOT NULL 
  AND access_token = public.get_invoice_token()
);

-- Invoice items: Public access only via valid invoice token
CREATE POLICY "Anon read invoice items by valid token"
ON public.invoice_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
    AND i.access_token IS NOT NULL
    AND i.access_token = public.get_invoice_token()
  )
);

-- Sessions: Public access only with valid x-session-token header
CREATE POLICY "Anon read session by valid token"
ON public.sessions
FOR SELECT
TO anon
USING (
  access_token IS NOT NULL 
  AND access_token = public.get_session_token()
);

CREATE POLICY "Anon update session by valid token"
ON public.sessions
FOR UPDATE
TO anon
USING (
  access_token IS NOT NULL 
  AND access_token = public.get_session_token()
)
WITH CHECK (
  access_token IS NOT NULL 
  AND access_token = public.get_session_token()
);

-- Patients: Public read only via valid invoice OR session token
CREATE POLICY "Anon read patient by valid invoice token"
ON public.patients
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.patient_id = patients.id
    AND i.access_token IS NOT NULL
    AND i.access_token = public.get_invoice_token()
  )
);

CREATE POLICY "Anon read patient by valid session token"
ON public.patients
FOR SELECT
TO anon
USING (
  public.verify_session_token_for_patient(patients.id)
);

CREATE POLICY "Anon read patient by valid consent token"
ON public.patients
FOR SELECT
TO anon
USING (
  public.verify_consent_token_for_patient(patients.id)
);

-- Centers: Public read only via valid token
CREATE POLICY "Anon read center by valid invoice token"
ON public.centers
FOR SELECT
TO anon
USING (
  public.verify_invoice_token_for_center(centers.id)
);

CREATE POLICY "Anon read center by valid session token"
ON public.centers
FOR SELECT
TO anon
USING (
  public.verify_session_token_for_center(centers.id)
);

-- Consents: Public access only with valid x-consent-token header
CREATE POLICY "Anon read consent by valid token"
ON public.consents
FOR SELECT
TO anon
USING (
  access_token IS NOT NULL 
  AND access_token = public.get_consent_token()
);

CREATE POLICY "Anon update consent by valid token"
ON public.consents
FOR UPDATE
TO anon
USING (
  access_token IS NOT NULL 
  AND access_token = public.get_consent_token()
)
WITH CHECK (
  access_token IS NOT NULL 
  AND access_token = public.get_consent_token()
);

-- Consent signatures: Public insert/read only via valid consent token
CREATE POLICY "Anon insert signature by valid consent token"
ON public.consent_signatures
FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.id = consent_signatures.consent_id
    AND c.access_token IS NOT NULL
    AND c.access_token = public.get_consent_token()
    AND c.status = 'pending'
  )
);

CREATE POLICY "Anon read signatures by valid consent token"
ON public.consent_signatures
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.consents c
    WHERE c.id = consent_signatures.consent_id
    AND c.access_token IS NOT NULL
    AND c.access_token = public.get_consent_token()
  )
);

-- Consent templates: Public read only via valid consent token
CREATE POLICY "Anon read template by valid consent token"
ON public.consent_templates
FOR SELECT
TO anon
USING (
  public.verify_consent_token_for_template(consent_templates.id)
);

-- Center locations: Public read only via valid session token
CREATE POLICY "Anon read location by valid session token"
ON public.center_locations
FOR SELECT
TO anon
USING (
  public.verify_session_token_for_location(center_locations.id)
);

-- Profiles: Public read only via valid token
CREATE POLICY "Anon read professional by valid session token"
ON public.profiles
FOR SELECT
TO anon
USING (
  public.verify_session_token_for_professional(profiles.id)
);

CREATE POLICY "Anon read professional by valid consent token"
ON public.profiles
FOR SELECT
TO anon
USING (
  public.verify_consent_token_for_professional(profiles.id)
);