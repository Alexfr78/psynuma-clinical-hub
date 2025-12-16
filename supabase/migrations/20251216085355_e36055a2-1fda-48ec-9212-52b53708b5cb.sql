-- ============================================
-- FIX #1: Restrict public center access to safe fields only
-- The current policy exposes OAuth credentials, certificates, and sensitive business data
-- ============================================

-- Drop the dangerous policy that exposes all columns
DROP POLICY IF EXISTS "Public read center by slug" ON centers;

-- Create a view with only safe public fields for portal access
CREATE OR REPLACE VIEW public.portal_centers AS
SELECT 
  id,
  name,
  portal_slug,
  portal_enabled,
  portal_require_approval,
  portal_allow_professional_selection,
  portal_default_professional_id,
  reschedule_max_days,
  reschedule_slot_duration,
  reschedule_require_confirmation,
  -- Safe display-only info
  city,
  province,
  country,
  logo_url
FROM centers
WHERE portal_enabled = true AND portal_slug IS NOT NULL;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.portal_centers TO anon, authenticated;

-- ============================================
-- FIX #2: Fix session token RLS policies
-- Current policies allow anyone to read data if ANY session has a token
-- We need to validate that the user actually has the correct token
-- ============================================

-- Drop the vulnerable policies
DROP POLICY IF EXISTS "Public read patient via session token" ON patients;
DROP POLICY IF EXISTS "Public read professional via session token" ON profiles;
DROP POLICY IF EXISTS "Public read location via session token" ON center_locations;

-- Create a function to validate session token from request header
CREATE OR REPLACE FUNCTION public.get_session_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-session-token', '')
$$;

-- Create a function to verify session token and get patient_id
CREATE OR REPLACE FUNCTION public.verify_session_token_for_patient(patient_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND patient_id = patient_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Create a function to verify session token for professional
CREATE OR REPLACE FUNCTION public.verify_session_token_for_professional(professional_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND professional_id = professional_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Create a function to verify session token for location
CREATE OR REPLACE FUNCTION public.verify_session_token_for_location(location_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND location_id = location_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Create secure policies that validate the actual token
-- Patients: Only allow read if user has a valid token for THAT patient
CREATE POLICY "Public read patient via validated session token"
ON public.patients FOR SELECT TO public
USING (
  public.verify_session_token_for_patient(id)
);

-- Profiles: Only allow read if user has a valid token linking to THAT professional
CREATE POLICY "Public read professional via validated session token"
ON public.profiles FOR SELECT TO public
USING (
  public.verify_session_token_for_professional(id)
);

-- Locations: Only allow read if user has a valid token linking to THAT location
CREATE POLICY "Public read location via validated session token"
ON public.center_locations FOR SELECT TO public
USING (
  public.verify_session_token_for_location(id)
);