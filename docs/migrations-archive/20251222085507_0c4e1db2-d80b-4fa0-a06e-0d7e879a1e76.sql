-- Function to extract x-invoice-token header
CREATE OR REPLACE FUNCTION public.get_invoice_token()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NULLIF(current_setting('request.headers', true)::json->>'x-invoice-token', '')
$$;

-- Function to verify invoice token for center access
CREATE OR REPLACE FUNCTION public.verify_invoice_token_for_center(center_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.invoices
    WHERE access_token = public.get_invoice_token()
    AND center_id = center_uuid
    AND access_token IS NOT NULL
  )
$$;

-- RLS policy to allow reading center data via invoice token
CREATE POLICY "Public read center via invoice token"
ON public.centers
FOR SELECT
USING (public.verify_invoice_token_for_center(id));