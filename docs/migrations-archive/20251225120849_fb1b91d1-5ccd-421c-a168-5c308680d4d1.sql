-- =====================================================
-- MIGRACIÓN DE SEGURIDAD MULTI-TENANT COMPLETA
-- =====================================================

-- FASE 1: HOTFIX - Eliminar policies peligrosas
-- =====================================================

-- 1.1 Eliminar auto-asignación de roles (CRÍTICO)
DROP POLICY IF EXISTS "Users can assign initial roles" ON public.user_roles;

-- 1.2 Eliminar admin global en profiles (CRÍTICO)
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- 1.3 Eliminar admin global en user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- FASE 2: Añadir center_id a user_roles
-- =====================================================

-- 2.1 Añadir columna center_id
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.centers(id);

-- 2.2 Migrar datos existentes (rellenar center_id desde profiles)
UPDATE public.user_roles ur
SET center_id = p.center_id
FROM public.profiles p
WHERE p.id = ur.user_id
  AND ur.center_id IS NULL
  AND p.center_id IS NOT NULL;

-- 2.3 Eliminar roles huérfanos (usuarios sin centro)
DELETE FROM public.user_roles
WHERE center_id IS NULL;

-- 2.4 Hacer center_id NOT NULL
ALTER TABLE public.user_roles
ALTER COLUMN center_id SET NOT NULL;

-- 2.5 Eliminar constraint único antiguo si existe
ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- 2.6 Crear constraint único por centro (un rol por usuario por centro)
ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_unique_per_center UNIQUE (user_id, center_id, role);

-- 2.7 Crear índice para búsquedas rápidas por centro
CREATE INDEX IF NOT EXISTS idx_user_roles_center_id ON public.user_roles(center_id);

-- FASE 3: Reescribir funciones de roles (scoped por centro)
-- =====================================================

-- 3.1 Nueva función has_role_in_center
CREATE OR REPLACE FUNCTION public.has_role_in_center(_user_id uuid, _role public.app_role, _center_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND center_id = _center_id
  );
$$;

-- 3.2 Reescribir is_admin (scoped al centro del usuario)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_center(
    _user_id,
    'admin'::public.app_role,
    public.get_user_center_id(_user_id)
  );
$$;

-- 3.3 Reescribir is_professional (scoped al centro del usuario)
CREATE OR REPLACE FUNCTION public.is_professional(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_center(
    _user_id,
    'professional'::public.app_role,
    public.get_user_center_id(_user_id)
  );
$$;

-- 3.4 Actualizar has_role para que también sea scoped
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role_in_center(
    _user_id,
    _role,
    public.get_user_center_id(_user_id)
  );
$$;

-- FASE 4: Actualizar RLS policies
-- =====================================================

-- 4.1 Policy de profiles para admins (solo su centro)
CREATE POLICY "Admins can manage profiles in their center"
ON public.profiles
FOR ALL
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND public.get_user_center_id(auth.uid()) IS NOT NULL
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND public.get_user_center_id(auth.uid()) IS NOT NULL
  AND public.is_admin(auth.uid())
);

-- 4.2 Policy de user_roles para admins (solo su centro)
CREATE POLICY "Admins can manage roles in their center"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND public.get_user_center_id(auth.uid()) IS NOT NULL
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND public.get_user_center_id(auth.uid()) IS NOT NULL
  AND public.is_admin(auth.uid())
);

-- 4.3 Eliminar policy antigua de visualización de roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- 4.4 Policy para que usuarios vean sus propios roles o admin vea roles del centro
CREATE POLICY "Users can view roles in their center"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR (
    center_id = public.get_user_center_id(auth.uid())
    AND public.is_admin(auth.uid())
  )
);

-- FASE 5: Portal público seguro con RPC
-- =====================================================

-- 5.1 Eliminar policy pública de profiles (expone datos)
DROP POLICY IF EXISTS "Public read professionals for portal" ON public.profiles;

-- 5.2 Crear función RPC segura para listar profesionales del portal
CREATE OR REPLACE FUNCTION public.portal_list_professionals(_portal_slug text)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  specialty text,
  avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.first_name, p.last_name, p.specialty, p.avatar_url
  FROM public.profiles p
  JOIN public.centers c ON c.id = p.center_id
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.center_id = c.id
  WHERE c.portal_enabled = true
    AND c.portal_slug = _portal_slug
    AND p.is_active = true
    AND ur.role IN ('professional'::public.app_role, 'admin'::public.app_role);
$$;

-- 5.3 Dar permisos de ejecución a anon (para portal público)
GRANT EXECUTE ON FUNCTION public.portal_list_professionals(text) TO anon;
GRANT EXECUTE ON FUNCTION public.portal_list_professionals(text) TO authenticated;