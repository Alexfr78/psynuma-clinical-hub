-- Cualquier usuario autenticado sin centro (incluidos los pacientes del
-- portal) podía insertar filas en centers directamente por la API, tantas
-- veces como quisiera. Desde 20261007150100 ya no podía entrar en ellas, pero
-- ensuciaba centers / centers_public.
--
-- El alta de centro va siempre por bootstrap_create_center (SECURITY
-- DEFINER, no necesita esta policy) y ningún cliente inserta en centers.

DROP POLICY IF EXISTS "Users can create their first center" ON public.centers;
