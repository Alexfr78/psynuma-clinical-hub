-- Drop existing function with old return type
DROP FUNCTION IF EXISTS public.get_public_center_info(uuid);

-- Recreate with expanded safe columns
CREATE OR REPLACE FUNCTION public.get_public_center_info(p_center_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  postal_code text,
  province text,
  phone text,
  email text,
  logo_url text,
  invoice_logo_url text,
  invoice_footer text,
  invoice_data_protection_text text,
  portal_slug text,
  portal_enabled boolean,
  portal_require_approval boolean,
  portal_allow_professional_selection boolean,
  portal_default_professional_id uuid,
  public_domain text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id, c.name, c.address, c.city, c.postal_code,
    c.province, c.phone, c.email, c.logo_url,
    c.invoice_logo_url, c.invoice_footer,
    c.invoice_data_protection_text,
    c.portal_slug, c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.public_domain
  FROM public.centers c
  WHERE c.id = p_center_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_center_info(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_center_info(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_center_info(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_center_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  name text,
  address text,
  city text,
  phone text,
  email text,
  logo_url text,
  portal_slug text,
  portal_enabled boolean,
  portal_require_approval boolean,
  portal_allow_professional_selection boolean,
  portal_default_professional_id uuid,
  public_domain text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.id, c.name, c.address, c.city, c.phone, c.email,
    c.logo_url, c.portal_slug, c.portal_enabled,
    c.portal_require_approval,
    c.portal_allow_professional_selection,
    c.portal_default_professional_id,
    c.public_domain
  FROM public.centers c
  WHERE c.portal_slug = p_slug
    AND c.portal_enabled = true;
$$;

REVOKE ALL ON FUNCTION public.get_public_center_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_center_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_center_by_slug(text) TO authenticated;

-- Drop any remaining anon SELECT policies on centers
DROP POLICY IF EXISTS "Anon read center by valid invoice token" ON public.centers;
DROP POLICY IF EXISTS "Anon read center by valid session token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid invoice token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid session token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid consent token" ON public.centers;
DROP POLICY IF EXISTS "Public read center by slug" ON public.centers;
DROP POLICY IF EXISTS "Anon read center by consent token" ON public.centers;
DROP POLICY IF EXISTS "Public read center safe fields for portal" ON public.centers;