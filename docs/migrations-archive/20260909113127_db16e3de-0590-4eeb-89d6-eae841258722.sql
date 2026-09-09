-- Duplica exactamente 20260908160000_plaud_recordings_delete_policy.sql, escrita a mano y
-- aplicada por separado. Se conservan las dos porque no consta cuál quedó registrada como
-- aplicada, y el guard de abajo hace que ejecutar ambas en orden ya no rompa la cadena.
DROP POLICY IF EXISTS "Admins and professionals delete plaud recordings in center"
  ON public.plaud_recordings;

CREATE POLICY "Admins and professionals delete plaud recordings in center"
ON public.plaud_recordings FOR DELETE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);