-- Permisos del bucket invoice-documents.
--
-- Antes, cualquier admin o profesional del centro podía leer, subir,
-- sobrescribir y borrar todo lo que hay bajo {center_id}/. Eso incluía los PDF
-- de facturas emitidas, que son legalmente inmutables, y la firma manuscrita
-- del modelo formal ({center_id}/branding/invoice-signature.*).
--
-- Los PDF de factura solo los escriben edge functions con la service role, que
-- no pasa por RLS (generate-invoice-pdf, send-invoice-notification). Desde el
-- cliente solo se escribe la firma, en la pantalla de ajustes del admin.
--
-- Queda así:
--   SELECT   admin o profesional del centro. La carpeta branding/ solo el admin.
--   INSERT / UPDATE / DELETE   solo el admin y solo en las dos rutas fijas de
--            la firma de su centro. Ningún usuario puede tocar los PDF emitidos.

DROP POLICY IF EXISTS "Read invoice docs from own center" ON storage.objects;
DROP POLICY IF EXISTS "Insert invoice docs into own center" ON storage.objects;
DROP POLICY IF EXISTS "Update invoice docs in own center" ON storage.objects;
DROP POLICY IF EXISTS "Delete invoice docs in own center" ON storage.objects;

CREATE POLICY "Read invoice docs from own center" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
    AND (storage.foldername(name))[1] = public.get_user_center_id(auth.uid())::text
    AND (
      (storage.foldername(name))[2] IS DISTINCT FROM 'branding'
      OR public.is_admin(auth.uid())
    )
  );

CREATE POLICY "Admins insert invoice signature" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-documents'
    AND public.is_admin(auth.uid())
    AND name IN (
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.png',
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.jpg'
    )
  );

CREATE POLICY "Admins update invoice signature" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND public.is_admin(auth.uid())
    AND name IN (
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.png',
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.jpg'
    )
  )
  WITH CHECK (
    bucket_id = 'invoice-documents'
    AND public.is_admin(auth.uid())
    AND name IN (
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.png',
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.jpg'
    )
  );

CREATE POLICY "Admins delete invoice signature" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-documents'
    AND public.is_admin(auth.uid())
    AND name IN (
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.png',
      public.get_user_center_id(auth.uid())::text || '/branding/invoice-signature.jpg'
    )
  );
