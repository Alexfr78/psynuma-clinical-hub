-- Return only the recipient attached to the invoice identified by the exact
-- public access token. Direct anonymous reads from patients remain disabled.
CREATE OR REPLACE FUNCTION public.get_patient_for_invoice_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'tax_id', p.tax_id,
    'address', p.address,
    'city', p.city,
    'postal_code', p.postal_code,
    'email', p.email,
    'phone', p.phone
  )
  FROM public.invoices i
  JOIN public.patients p ON p.id = i.patient_id
  WHERE p_token IS NOT NULL
    AND length(trim(p_token)) > 0
    AND i.access_token = p_token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_patient_for_invoice_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_patient_for_invoice_token(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_patient_for_invoice_token(text) IS
  'Returns invoice-recipient display fields only when the exact invoice access token is supplied.';
