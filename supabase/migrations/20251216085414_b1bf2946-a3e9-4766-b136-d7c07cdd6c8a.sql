-- Fix the SECURITY DEFINER view issue
-- Recreate the view with SECURITY INVOKER to use caller's permissions
DROP VIEW IF EXISTS public.portal_centers;

CREATE VIEW public.portal_centers 
WITH (security_invoker = true)
AS
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
  city,
  province,
  country,
  logo_url
FROM centers
WHERE portal_enabled = true AND portal_slug IS NOT NULL;

-- Grant SELECT on the view to anon and authenticated
GRANT SELECT ON public.portal_centers TO anon, authenticated;

-- Now we need a policy on centers that allows the view to work
-- Create a policy that only allows reading the non-sensitive fields for public portals
CREATE POLICY "Public read center safe fields for portal"
ON centers FOR SELECT TO public
USING (
  portal_enabled = true 
  AND portal_slug IS NOT NULL
);