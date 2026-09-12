-- Antes solo un administrador podía borrar informes generados. El profesional que los
-- genera y gestiona debe poder eliminarlos manualmente antes de que expire su retención.
DROP POLICY IF EXISTS "Admins delete generated documents in center"
  ON public.ai_generated_documents;

CREATE POLICY "Admins and professionals delete generated documents in center"
  ON public.ai_generated_documents
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    center_id = get_user_center_id(auth.uid())
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );
