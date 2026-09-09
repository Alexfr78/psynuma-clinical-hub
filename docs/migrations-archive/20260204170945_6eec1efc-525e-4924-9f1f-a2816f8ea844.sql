-- Fix 1: Add search_path to uuid_to_lock_id function
CREATE OR REPLACE FUNCTION public.uuid_to_lock_id(p_uuid uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ('x' || substr(p_uuid::text, 1, 16))::bit(64)::bigint
$$;

-- Fix 2: Update centers_public view to remove sensitive fields (email, phone)
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
FROM public.centers;

COMMENT ON VIEW public.centers_public IS 'Public view of centers without sensitive contact information (email, phone removed for privacy)';