-- The initial "Professionals access invoice documents" policy only checked
-- role (admin/professional), not center ownership - any professional at any
-- center could read/write any other center's invoice-documents objects.
-- Same issue already fixed for consent-documents in 20260527141637; apply
-- the same per-center folder scoping here (objects are stored at
-- {center_id}/{invoice_id}.pdf).
DROP POLICY IF EXISTS "Professionals access invoice documents" ON storage.objects;

CREATE POLICY "Read invoice docs from own center"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoice-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Insert invoice docs into own center"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoice-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Update invoice docs in own center"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoice-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Delete invoice docs in own center"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoice-documents'
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);
