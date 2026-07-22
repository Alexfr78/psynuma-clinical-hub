DROP POLICY IF EXISTS "Professionals can manage emotional records for their center" ON public.emotional_records;

CREATE POLICY "Clinical staff can manage emotional records for their center"
ON public.emotional_records
FOR ALL
TO authenticated
USING (
  center_id = get_user_center_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'professional'::app_role))
)
WITH CHECK (
  center_id = get_user_center_id(auth.uid())
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'professional'::app_role))
);