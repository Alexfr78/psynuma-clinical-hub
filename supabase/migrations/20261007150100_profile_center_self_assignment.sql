-- Un usuario no puede asignarse un centro ajeno.
--
-- Fallo (comprobado en producción el 2026-10-07): la policy "Users can update
-- their own profile" no tiene WITH CHECK, y el trigger
-- prevent_profile_center_self_change dejaba pasar dos casos:
--   1. center_id NULL -> cualquier centro (excepción pensada para el
--      asistente de alta, pero válida para cualquiera sin centro);
--   2. cualquier cambio si el usuario es admin, y cualquiera puede ser admin
--      creando su propio centro con bootstrap_create_center.
-- Con el id de un centro (centers_public lo expone a anon) bastaba un
-- UPDATE sobre el propio perfil para entrar en ese centro: 53 policies solo
-- comparan get_user_center_id(auth.uid()) y no el rol.
-- No había indicios de uso: todos los perfiles con centro tienen rol en él.
--
-- Ahora nadie cambia su propio center_id, sea admin o no. La única excepción
-- es bootstrap_create_center, que marca en la transacción el centro que
-- acaba de crear (set_config local); la marca no se puede poner desde la API.
-- Las asignaciones hechas por edge functions con service role (invitaciones,
-- portal) no pasan por esta regla porque auth.uid() es NULL.

CREATE OR REPLACE FUNCTION public.prevent_profile_center_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id THEN
    IF NEW.center_id IS DISTINCT FROM OLD.center_id THEN
      -- Solo el alta inicial desde bootstrap_create_center. Sin la marca,
      -- current_setting devuelve NULL: coalesce para que la condición sea
      -- falsa y no NULL (un IF NOT NULL no lanzaría la excepción).
      IF NOT (
        OLD.center_id IS NULL
        AND NEW.center_id IS NOT NULL
        AND coalesce(current_setting('psycma.bootstrap_center', true), '') = NEW.center_id::text
      ) THEN
        RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
      END IF;
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'No puedes cambiar tu estado activo';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bootstrap_create_center(p_name text, p_tax_id text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_center_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_can_create_center(v_user_id) THEN
    RAISE EXCEPTION 'User already has a center';
  END IF;

  INSERT INTO public.centers (
    name, tax_id, address, city, postal_code, phone, email
  ) VALUES (
    p_name,
    NULLIF(p_tax_id, ''),
    NULLIF(p_address, ''),
    NULLIF(p_city, ''),
    NULLIF(p_postal_code, ''),
    NULLIF(p_phone, ''),
    NULLIF(p_email, '')
  )
  RETURNING id INTO v_center_id;

  -- Marca local a esta transacción: prevent_profile_center_self_change solo
  -- deja que el usuario estrene centro si coincide con el que se acaba de crear.
  PERFORM set_config('psycma.bootstrap_center', v_center_id::text, true);

  UPDATE public.profiles
  SET center_id = v_center_id,
      updated_at = now()
  WHERE id = v_user_id;

  PERFORM set_config('psycma.bootstrap_center', '', true);

  INSERT INTO public.user_roles (user_id, center_id, role)
  VALUES
    (v_user_id, v_center_id, 'admin'::public.app_role),
    (v_user_id, v_center_id, 'professional'::public.app_role)
  ON CONFLICT (user_id, center_id, role) DO NOTHING;

  RETURN v_center_id;
END;
$function$;

-- El perfil lo crea handle_new_user al registrarse; si un cliente lo
-- insertara, no puede traer centro.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND center_id IS NULL);
