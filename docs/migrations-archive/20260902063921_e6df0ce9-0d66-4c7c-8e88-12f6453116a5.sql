CREATE OR REPLACE FUNCTION public.prevent_profile_center_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() = OLD.id AND NOT public.has_role(auth.uid(), 'admin') THEN
    -- Allow the initial center assignment (bootstrap): profile has no center yet.
    IF NEW.center_id IS DISTINCT FROM OLD.center_id AND OLD.center_id IS NOT NULL THEN
      RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
    END IF;
    IF NEW.center_id IS DISTINCT FROM OLD.center_id AND OLD.center_id IS NULL AND NEW.center_id IS NULL THEN
      RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'No puedes cambiar tu estado activo';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.__diag_center();
DROP FUNCTION IF EXISTS public.__diag_center2(uuid);