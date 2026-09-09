-- Permite borrar por completo una grabación Plaud desde la bandeja de revisión
-- (pendientes o resueltas), a petición del centro: quieren poder eliminar una
-- grabación sin dejar rastro, no solo descartarla (que la deja en la tabla con
-- status = 'ignored'). Mismo criterio que la política de UPDATE ya existente
-- (admin o profesional del centro) — la migración original de esta tabla
-- deliberadamente no traía política de DELETE porque en ese momento no había
-- ningún flujo que la necesitara.
CREATE POLICY "Admins and professionals delete plaud recordings in center"
ON public.plaud_recordings FOR DELETE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);
