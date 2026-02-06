-- Update the centers_public view to only expose data for portal-enabled centers
-- This restricts public visibility to only centers that have opted into public portal access

DROP VIEW IF EXISTS public.centers_public;

CREATE VIEW public.centers_public
WITH (security_invoker = on) AS
SELECT 
    c.id,
    c.name,
    c.address,
    c.address_details,
    c.city,
    c.postal_code,
    c.province,
    c.country,
    c.logo_url,
    c.invoice_logo_url,
    c.invoice_footer,
    c.portal_slug,
    c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.public_booking_enabled,
    c.reschedule_max_days,
    c.reschedule_slot_duration,
    c.reschedule_require_confirmation,
    c.consent_expiration_days,
    c.default_tax_rate,
    c.default_tax_name,
    c.include_tax_in_price,
    c.retention_rate,
    c.retention_name
FROM public.centers c
WHERE c.portal_enabled = true;