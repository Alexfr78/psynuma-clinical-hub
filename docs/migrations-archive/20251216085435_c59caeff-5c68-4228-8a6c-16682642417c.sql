-- Remove the dangerous policy that still exposes all center columns
-- Public access should ONLY be through the portal_centers view
DROP POLICY IF EXISTS "Public read center safe fields for portal" ON centers;

-- The portal_centers view already filters columns, so we need an alternative approach
-- Create a secure function to get portal center data
CREATE OR REPLACE FUNCTION public.get_portal_center(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  portal_slug TEXT,
  portal_enabled BOOLEAN,
  portal_require_approval BOOLEAN,
  portal_allow_professional_selection BOOLEAN,
  portal_default_professional_id UUID,
  reschedule_max_days INTEGER,
  reschedule_slot_duration INTEGER,
  reschedule_require_confirmation BOOLEAN,
  city TEXT,
  province TEXT,
  country TEXT,
  logo_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.name,
    c.portal_slug,
    c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.reschedule_max_days,
    c.reschedule_slot_duration,
    c.reschedule_require_confirmation,
    c.city,
    c.province,
    c.country,
    c.logo_url
  FROM centers c
  WHERE c.portal_enabled = true 
    AND c.portal_slug IS NOT NULL
    AND c.portal_slug = p_slug
$$;