-- ---------------------------------------------------------------------------
-- 1. WITH CHECK explícito en las políticas UPDATE de storage.objects
--    Sin WITH CHECK, Postgres ya aplica el USING a la fila nueva, así que esto
--    no cambia el acceso: lo deja explícito (y es lo que pide el escáner de
--    Lovable) para que nadie pueda mover un objeto a la carpeta de otro centro.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can update their center logos" ON storage.objects;
CREATE POLICY "Users can update their center logos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-logos'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'invoice-logos'
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update consent docs in own center" ON storage.objects;
CREATE POLICY "Update consent docs in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'consent-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update expense receipts in own center" ON storage.objects;
CREATE POLICY "Update expense receipts in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Update invoice docs in own center" ON storage.objects;
CREATE POLICY "Update invoice docs in own center" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'invoice-documents'
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = (
      SELECT profiles.center_id::text FROM profiles WHERE profiles.id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. consents.signed_pdf_url deja de guardar una URL firmada de un año
--    generate-consent-pdf ahora guarda la ruta del objeto y entrega enlaces
--    de una hora en cada consulta. Se sustituyen las URLs ya guardadas para
--    que no sigan circulando desde la base. (Las URLs ya enviadas por WhatsApp
--    o abiertas antes siguen valiendo hasta que caduquen.)
-- ---------------------------------------------------------------------------
UPDATE public.consents
SET signed_pdf_url = center_id::text || '/' || id::text || '.pdf'
WHERE signed_pdf_url LIKE 'http%';
