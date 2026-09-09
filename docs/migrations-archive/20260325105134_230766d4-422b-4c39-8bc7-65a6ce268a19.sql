
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Authenticated users can upload consent documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read consent documents" ON storage.objects;

-- Tighter policy: users can only upload to their center's folder
CREATE POLICY "Users upload consent docs to own center"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'consent-documents'
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

-- Tighter policy: users can only read from their center's folder
CREATE POLICY "Users read consent docs from own center"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'consent-documents'
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);
