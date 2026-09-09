-- Scope internal center policies to authenticated clinical users.
-- Public consent access remains available only through the separate token policies.

DROP POLICY IF EXISTS "View consents in center" ON public.consents;
CREATE POLICY "View consents in center"
ON public.consents
FOR SELECT
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

DROP POLICY IF EXISTS "Manage consents in center" ON public.consents;
CREATE POLICY "Manage consents in center"
ON public.consents
FOR ALL
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

DROP POLICY IF EXISTS "Users can view their center's messages" ON public.whatsapp_messages;
CREATE POLICY "Users can view their center's messages"
ON public.whatsapp_messages
FOR SELECT
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

DROP POLICY IF EXISTS "Users can create messages for their center" ON public.whatsapp_messages;
CREATE POLICY "Users can create messages for their center"
ON public.whatsapp_messages
FOR INSERT
TO authenticated
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

DROP POLICY IF EXISTS "Users can update their center's messages" ON public.whatsapp_messages;
CREATE POLICY "Users can update their center's messages"
ON public.whatsapp_messages
FOR UPDATE
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);
