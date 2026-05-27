
-- 1) oauth_connections: restrict SELECT to owner only (remove admin bypass)
DROP POLICY IF EXISTS "Professionals can select own oauth connections" ON public.oauth_connections;
CREATE POLICY "Professionals can select own oauth connections"
ON public.oauth_connections
FOR SELECT
TO authenticated
USING (professional_id = auth.uid());

DROP POLICY IF EXISTS "Professionals can insert oauth connections" ON public.oauth_connections;
CREATE POLICY "Professionals can insert oauth connections"
ON public.oauth_connections
FOR INSERT
TO authenticated
WITH CHECK (professional_id = auth.uid());

DROP POLICY IF EXISTS "Professionals can update own oauth connections" ON public.oauth_connections;
CREATE POLICY "Professionals can update own oauth connections"
ON public.oauth_connections
FOR UPDATE
TO authenticated
USING (professional_id = auth.uid())
WITH CHECK (professional_id = auth.uid());

DROP POLICY IF EXISTS "Professionals can delete own oauth connections" ON public.oauth_connections;
CREATE POLICY "Professionals can delete own oauth connections"
ON public.oauth_connections
FOR DELETE
TO authenticated
USING (professional_id = auth.uid());

-- 2) tariff_plans: split read vs write, require admin/professional for writes
DROP POLICY IF EXISTS "tp_center_access" ON public.tariff_plans;

CREATE POLICY "tp_center_read"
ON public.tariff_plans
FOR SELECT
TO authenticated
USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "tp_center_write_insert"
ON public.tariff_plans
FOR INSERT
TO authenticated
WITH CHECK (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "tp_center_write_update"
ON public.tariff_plans
FOR UPDATE
TO authenticated
USING (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "tp_center_write_delete"
ON public.tariff_plans
FOR DELETE
TO authenticated
USING (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

-- 3) tariff_plan_items
DROP POLICY IF EXISTS "tpi_center_access" ON public.tariff_plan_items;

CREATE POLICY "tpi_center_read"
ON public.tariff_plan_items
FOR SELECT
TO authenticated
USING (
  tariff_plan_id IN (
    SELECT tp.id FROM public.tariff_plans tp
    JOIN public.profiles p ON p.center_id = tp.center_id
    WHERE p.id = auth.uid()
  )
);

CREATE POLICY "tpi_center_write_insert"
ON public.tariff_plan_items
FOR INSERT
TO authenticated
WITH CHECK (
  tariff_plan_id IN (
    SELECT tp.id FROM public.tariff_plans tp
    JOIN public.profiles p ON p.center_id = tp.center_id
    WHERE p.id = auth.uid()
  )
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "tpi_center_write_update"
ON public.tariff_plan_items
FOR UPDATE
TO authenticated
USING (
  tariff_plan_id IN (
    SELECT tp.id FROM public.tariff_plans tp
    JOIN public.profiles p ON p.center_id = tp.center_id
    WHERE p.id = auth.uid()
  )
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  tariff_plan_id IN (
    SELECT tp.id FROM public.tariff_plans tp
    JOIN public.profiles p ON p.center_id = tp.center_id
    WHERE p.id = auth.uid()
  )
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "tpi_center_write_delete"
ON public.tariff_plan_items
FOR DELETE
TO authenticated
USING (
  tariff_plan_id IN (
    SELECT tp.id FROM public.tariff_plans tp
    JOIN public.profiles p ON p.center_id = tp.center_id
    WHERE p.id = auth.uid()
  )
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

-- 4) patient_tariff_plan_assignments
DROP POLICY IF EXISTS "ptpa_center_access" ON public.patient_tariff_plan_assignments;

CREATE POLICY "ptpa_center_read"
ON public.patient_tariff_plan_assignments
FOR SELECT
TO authenticated
USING (center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "ptpa_center_write_insert"
ON public.patient_tariff_plan_assignments
FOR INSERT
TO authenticated
WITH CHECK (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "ptpa_center_write_update"
ON public.patient_tariff_plan_assignments
FOR UPDATE
TO authenticated
USING (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "ptpa_center_write_delete"
ON public.patient_tariff_plan_assignments
FOR DELETE
TO authenticated
USING (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

-- 5) whatsapp_sessions: revoke SELECT on sensitive credential columns from regular roles
REVOKE SELECT (api_key, webhook_secret) ON public.whatsapp_sessions FROM authenticated, anon;
