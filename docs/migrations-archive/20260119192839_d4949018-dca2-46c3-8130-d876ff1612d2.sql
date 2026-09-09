-- Fix SECURITY DEFINER views by setting security_invoker = true
-- This ensures views respect the RLS policies of the querying user, not the view creator

-- Recreate centers_public view with SECURITY INVOKER
DROP VIEW IF EXISTS public.centers_public;
CREATE VIEW public.centers_public WITH (security_invoker = true) AS
SELECT 
    id,
    name,
    address,
    address_details,
    city,
    postal_code,
    province,
    country,
    phone,
    email,
    logo_url,
    invoice_logo_url,
    invoice_footer,
    portal_enabled,
    portal_slug,
    portal_require_approval,
    portal_allow_professional_selection,
    reschedule_max_days,
    reschedule_slot_duration,
    reschedule_require_confirmation,
    public_booking_enabled,
    consent_expiration_days,
    default_tax_rate,
    default_tax_name,
    include_tax_in_price,
    retention_rate,
    retention_name
FROM centers;

-- Recreate patients_public view with SECURITY INVOKER
DROP VIEW IF EXISTS public.patients_public;
CREATE VIEW public.patients_public WITH (security_invoker = true) AS
SELECT 
    id,
    center_id,
    first_name,
    last_name,
    is_minor
FROM patients;

-- Recreate profiles_public view with SECURITY INVOKER
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker = true) AS
SELECT 
    id,
    center_id,
    first_name,
    last_name,
    specialty,
    is_active,
    avatar_url
FROM profiles;

-- Grant SELECT permissions to authenticated and anon roles for these views
GRANT SELECT ON public.centers_public TO authenticated, anon;
GRANT SELECT ON public.patients_public TO authenticated, anon;
GRANT SELECT ON public.profiles_public TO authenticated, anon;