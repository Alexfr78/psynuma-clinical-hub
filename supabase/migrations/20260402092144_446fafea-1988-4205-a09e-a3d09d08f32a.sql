-- 1. Fix invoice_items: replace broken policy with proper token check
DROP POLICY IF EXISTS "Public read invoice items by access_token" ON public.invoice_items;

CREATE POLICY "Public read invoice items by valid token"
ON public.invoice_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_items.invoice_id
      AND i.access_token IS NOT NULL
      AND i.access_token = get_invoice_token()
  )
);

-- 2. Fix consent_signatures: drop broken policies (safe duplicates exist)
DROP POLICY IF EXISTS "Insert signature by token" ON public.consent_signatures;
DROP POLICY IF EXISTS "Read signatures by token" ON public.consent_signatures;

-- 3. Recreate centers_public view without sensitive financial fields
DROP VIEW IF EXISTS public.centers_public;

CREATE VIEW public.centers_public AS
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
  portal_slug,
  portal_enabled,
  portal_require_approval,
  portal_allow_professional_selection,
  public_booking_enabled,
  reschedule_max_days,
  reschedule_slot_duration,
  reschedule_require_confirmation,
  consent_expiration_days
FROM public.centers c
WHERE portal_enabled = true;

-- Grant access to the view
GRANT SELECT ON public.centers_public TO anon, authenticated;

-- 4. Fix invoice-logos storage policies to scope by center
DROP POLICY IF EXISTS "Authenticated users can upload invoice logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their center logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their center logos" ON storage.objects;

CREATE POLICY "Authenticated users can upload invoice logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoice-logos'
  AND (storage.foldername(name))[1] = (
    SELECT center_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can update their center logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'invoice-logos'
  AND (storage.foldername(name))[1] = (
    SELECT center_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can delete their center logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoice-logos'
  AND (storage.foldername(name))[1] = (
    SELECT center_id::text FROM public.profiles WHERE id = auth.uid()
  )
);