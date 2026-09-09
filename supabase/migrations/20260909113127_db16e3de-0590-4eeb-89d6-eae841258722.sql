CREATE POLICY "Admins and professionals delete plaud recordings in center"
ON public.plaud_recordings FOR DELETE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);