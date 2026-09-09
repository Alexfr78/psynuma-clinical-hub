-- Re-add professional SELECT policy (they need basic center data for invoicing)
-- Credentials are protected at application level via get_safe_center RPC
CREATE POLICY "Professionals can view their center"
  ON public.centers FOR SELECT
  TO authenticated
  USING (
    id = get_user_center_id(auth.uid())
  );

-- Drop the admin-only policy since the above covers both
DROP POLICY IF EXISTS "Admins can view their center" ON public.centers;

-- RPC for public debt page: returns only safe center info
CREATE OR REPLACE FUNCTION public.get_center_for_debt(p_center_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'bizum_phone', c.bizum_phone,
    'has_stripe', (c.oauth_stripe_credentials IS NOT NULL)
  ) INTO v_result
  FROM public.centers c
  WHERE c.id = p_center_id;
  
  RETURN v_result;
END;
$$;

-- RPC for public invoice page: returns only display/billing info
CREATE OR REPLACE FUNCTION public.get_center_for_invoice(p_center_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'postal_code', c.postal_code,
    'province', c.province,
    'tax_id', c.tax_id,
    'phone', c.phone,
    'email', c.email,
    'invoice_logo_url', c.invoice_logo_url,
    'invoice_footer', c.invoice_footer,
    'invoice_data_protection_text', c.invoice_data_protection_text
  ) INTO v_result
  FROM public.centers c
  WHERE c.id = p_center_id;
  
  RETURN v_result;
END;
$$;