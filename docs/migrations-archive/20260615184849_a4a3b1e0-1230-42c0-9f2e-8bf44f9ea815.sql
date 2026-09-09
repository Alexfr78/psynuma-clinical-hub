
-- professional_integrations: scope admin access to same center
DROP POLICY IF EXISTS "Professionals manage own integrations" ON public.professional_integrations;
CREATE POLICY "Professionals manage own integrations"
ON public.professional_integrations
FOR ALL
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

-- audit_log: scope admin read to same center
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log"
ON public.audit_log
FOR SELECT
USING (
  is_admin(auth.uid())
  AND user_id IN (
    SELECT id FROM public.profiles WHERE center_id = get_user_center_id(auth.uid())
  )
);
