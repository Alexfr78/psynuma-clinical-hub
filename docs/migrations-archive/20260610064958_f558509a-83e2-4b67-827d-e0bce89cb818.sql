
-- calendar_events: scope admin access to own center
DROP POLICY IF EXISTS "Professionals can manage their calendar events" ON public.calendar_events;
DROP POLICY IF EXISTS "Professionals can view their calendar events" ON public.calendar_events;

CREATE POLICY "Professionals can view their calendar events"
ON public.calendar_events FOR SELECT TO authenticated
USING (
  professional_id = auth.uid()
  OR (
    is_admin(auth.uid())
    AND professional_id IN (
      SELECT id FROM public.profiles WHERE center_id = get_user_center_id(auth.uid())
    )
  )
);

CREATE POLICY "Professionals can manage their calendar events"
ON public.calendar_events FOR ALL TO authenticated
USING (
  professional_id = auth.uid()
  OR (
    is_admin(auth.uid())
    AND professional_id IN (
      SELECT id FROM public.profiles WHERE center_id = get_user_center_id(auth.uid())
    )
  )
)
WITH CHECK (
  professional_id = auth.uid()
  OR (
    is_admin(auth.uid())
    AND professional_id IN (
      SELECT id FROM public.profiles WHERE center_id = get_user_center_id(auth.uid())
    )
  )
);

-- notifications: restrict SELECT to admins/professionals
DROP POLICY IF EXISTS "View notifications in center" ON public.notifications;
CREATE POLICY "View notifications in center"
ON public.notifications FOR SELECT TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- patient_magic_links: restrict SELECT to admins/professionals
DROP POLICY IF EXISTS "Professionals can view their center magic links" ON public.patient_magic_links;
CREATE POLICY "Professionals can view their center magic links"
ON public.patient_magic_links FOR SELECT TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- professional_integrations: restrict SELECT to admins/professionals
DROP POLICY IF EXISTS "View integrations in center" ON public.professional_integrations;
CREATE POLICY "View integrations in center"
ON public.professional_integrations FOR SELECT TO authenticated
USING (
  professional_id IN (
    SELECT id FROM public.profiles WHERE center_id = get_user_center_id(auth.uid())
  )
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- verifactu_chain_status: restrict to authenticated admins
DROP POLICY IF EXISTS "Centers can manage their chain status" ON public.verifactu_chain_status;
CREATE POLICY "Centers can manage their chain status"
ON public.verifactu_chain_status FOR ALL TO authenticated
USING (
  is_admin(auth.uid())
  AND center_id IN (SELECT p.center_id FROM public.profiles p WHERE p.id = auth.uid())
)
WITH CHECK (
  is_admin(auth.uid())
  AND center_id IN (SELECT p.center_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- whatsapp_queue: restrict to admins/professionals
DROP POLICY IF EXISTS "Users can manage their center's queue" ON public.whatsapp_queue;
DROP POLICY IF EXISTS "Users can view their center's queue" ON public.whatsapp_queue;

CREATE POLICY "Users can view their center's queue"
ON public.whatsapp_queue FOR SELECT TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

CREATE POLICY "Users can manage their center's queue"
ON public.whatsapp_queue FOR ALL TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
)
WITH CHECK (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- whatsapp_sessions: restrict writes to admins/professionals
DROP POLICY IF EXISTS "Users can create sessions for their center" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can update their center's sessions" ON public.whatsapp_sessions;
DROP POLICY IF EXISTS "Users can delete their center's sessions" ON public.whatsapp_sessions;

CREATE POLICY "Users can create sessions for their center"
ON public.whatsapp_sessions FOR INSERT TO authenticated
WITH CHECK (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

CREATE POLICY "Users can update their center's sessions"
ON public.whatsapp_sessions FOR UPDATE TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
)
WITH CHECK (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

CREATE POLICY "Users can delete their center's sessions"
ON public.whatsapp_sessions FOR DELETE TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);
