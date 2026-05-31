
-- Fix 1: Prevent users from reassigning themselves to a different center via profile self-update
CREATE OR REPLACE FUNCTION public.prevent_profile_center_self_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins (acting on other profiles in their center) bypass this check via the admin policy.
  -- When a user updates their own profile row, block changes to privileged columns.
  IF auth.uid() = OLD.id AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF NEW.center_id IS DISTINCT FROM OLD.center_id THEN
      RAISE EXCEPTION 'No puedes cambiar tu centro asignado';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'No puedes cambiar tu estado activo';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_center_self_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_center_self_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_center_self_change();

-- Fix 2: Restrict whatsapp_sessions SELECT (api_key, webhook_secret, qr_code) to admins/professionals only
DROP POLICY IF EXISTS "Users can view their center's sessions" ON public.whatsapp_sessions;

CREATE POLICY "Admins and professionals can view their center's whatsapp sessions"
ON public.whatsapp_sessions
FOR SELECT
TO authenticated
USING (
  center_id IN (SELECT center_id FROM public.profiles WHERE id = auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'professional'))
);
