-- Drop existing view first to recreate with correct columns
DROP VIEW IF EXISTS public.portal_centers;

-- Create a secure public view for centers that only exposes safe columns
CREATE VIEW public.portal_centers AS
SELECT 
  id,
  name,
  logo_url,
  city,
  province,
  country,
  portal_enabled,
  portal_require_approval,
  portal_allow_professional_selection,
  portal_default_professional_id,
  reschedule_max_days,
  reschedule_slot_duration,
  reschedule_require_confirmation,
  portal_slug,
  public_booking_enabled
FROM public.centers;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.portal_centers TO anon;
GRANT SELECT ON public.portal_centers TO authenticated;

-- Drop the overly permissive anon policies on centers table
DROP POLICY IF EXISTS "Anon read limited center by valid invoice token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid session token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid consent token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by portal slug" ON public.centers;
DROP POLICY IF EXISTS "Anon can view center for public booking" ON public.centers;