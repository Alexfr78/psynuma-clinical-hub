-- Avisos de novedades al publicar una versión.
--
-- 1. Solo el dueño de la plataforma (tabla platform_owners) gestiona versiones.
--    Antes bastaba con ser admin de cualquier centro, y las tablas son globales:
--    el admin de otro centro podía crear o publicar versiones para todos.
-- 2. El resto de usuarios con centro puede enviar peticiones de cambio
--    (app_change_log en estado 'pending') y ver las suyas.
-- 3. Las novedades se leen con get_release_notes(): solo versiones publicadas y
--    solo los cambios marcados como visibles, sin descripciones internas.
-- 4. profiles.release_notes_seen_at guarda hasta qué publicación ha visto cada
--    usuario, para que el aviso salga una vez y en cualquier dispositivo.

-- ── Dueño de la plataforma ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_owners (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_owners FROM anon, authenticated;

-- Alejandro Fernández (alejandro@psicologosexual.com)
INSERT INTO public.platform_owners (user_id)
VALUES ('feb134c7-1065-4085-867c-408f0ff68153')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.platform_owners WHERE user_id = _user_id);
$function$;

REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_owner(uuid) TO authenticated;

-- Para el frontend: solo responde por el propio usuario, no por un id ajeno.
CREATE OR REPLACE FUNCTION public.am_i_platform_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.is_platform_owner(auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.am_i_platform_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.am_i_platform_owner() TO authenticated;

-- ── Columnas nuevas ───────────────────────────────────────────────────────
ALTER TABLE public.app_change_log
  ADD COLUMN IF NOT EXISTS is_user_facing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS user_summary text,
  ADD COLUMN IF NOT EXISTS requester_label text;

-- Lo técnico y lo de seguridad no se anuncia por defecto.
UPDATE public.app_change_log
SET is_user_facing = false
WHERE change_type IN ('technical', 'security');

-- Límites también en la base: las peticiones pueden llegar sin pasar por el formulario.
ALTER TABLE public.app_change_log
  DROP CONSTRAINT IF EXISTS app_change_log_title_length_check,
  DROP CONSTRAINT IF EXISTS app_change_log_description_length_check,
  DROP CONSTRAINT IF EXISTS app_change_log_user_summary_length_check;
ALTER TABLE public.app_change_log
  ADD CONSTRAINT app_change_log_title_length_check CHECK (length(title) <= 200),
  ADD CONSTRAINT app_change_log_description_length_check CHECK (description IS NULL OR length(description) <= 2000),
  ADD CONSTRAINT app_change_log_user_summary_length_check CHECK (user_summary IS NULL OR length(user_summary) <= 500);

ALTER TABLE public.app_versions
  ADD COLUMN IF NOT EXISTS announce_mode text NOT NULL DEFAULT 'normal';

ALTER TABLE public.app_versions
  DROP CONSTRAINT IF EXISTS app_versions_announce_mode_check;
ALTER TABLE public.app_versions
  ADD CONSTRAINT app_versions_announce_mode_check
  CHECK (announce_mode IN ('highlight', 'normal'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS release_notes_seen_at timestamptz;

-- Las 12 versiones ya publicadas no se anuncian: el primer aviso será la próxima.
UPDATE public.profiles
SET release_notes_seen_at = now()
WHERE release_notes_seen_at IS NULL;

-- ── Peticiones: lo que decide la base, no el cliente ─────────────────────
-- Para quien no es el dueño:
--   * created_by y requester_label los fija la base y no se pueden reescribir.
--   * Nada de lo que escriba sale en el aviso: is_user_facing, user_summary y
--     affects_verifactu solo los decide el dueño, después de leer la petición.
--   * Como mucho 20 peticiones pendientes por usuario.
CREATE OR REPLACE FUNCTION public.app_change_log_guard_requests()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Sin sesión (migraciones, service role) o el dueño: sin restricciones.
  IF v_uid IS NULL OR public.is_platform_owner(v_uid) THEN
    IF TG_OP = 'INSERT' AND v_uid IS NOT NULL THEN
      NEW.created_by := v_uid;
      NEW.requester_label := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.app_change_log
         WHERE created_by = v_uid AND status = 'pending') >= 20 THEN
      RAISE EXCEPTION 'Tienes demasiadas peticiones pendientes. Espera a que se revisen.';
    END IF;

    NEW.created_by := v_uid;
    SELECT NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '')
           || COALESCE(' · ' || c.name, '')
      INTO NEW.requester_label
      FROM public.profiles p
      LEFT JOIN public.centers c ON c.id = p.center_id
     WHERE p.id = v_uid;
    NEW.is_user_facing := false;
    NEW.user_summary := NULL;
    NEW.affects_verifactu := false;
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.requester_label := OLD.requester_label;
    NEW.is_user_facing := OLD.is_user_facing;
    NEW.user_summary := OLD.user_summary;
    NEW.affects_verifactu := OLD.affects_verifactu;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.app_change_log_guard_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.app_change_log_guard_requests() TO authenticated, service_role;

DROP TRIGGER IF EXISTS app_change_log_guard_requests_trigger ON public.app_change_log;
CREATE TRIGGER app_change_log_guard_requests_trigger
  BEFORE INSERT OR UPDATE ON public.app_change_log
  FOR EACH ROW EXECUTE FUNCTION public.app_change_log_guard_requests();

-- ── Políticas ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage app_versions" ON public.app_versions;
DROP POLICY IF EXISTS "Platform owner manages app_versions" ON public.app_versions;
CREATE POLICY "Platform owner manages app_versions" ON public.app_versions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage app_change_log" ON public.app_change_log;
DROP POLICY IF EXISTS "Platform owner manages app_change_log" ON public.app_change_log;
CREATE POLICY "Platform owner manages app_change_log" ON public.app_change_log
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS "Users view own change requests" ON public.app_change_log;
CREATE POLICY "Users view own change requests" ON public.app_change_log
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Users create change requests" ON public.app_change_log;
CREATE POLICY "Users create change requests" ON public.app_change_log
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND status = 'pending'
    AND version_id IS NULL
    AND public.get_user_center_id(auth.uid()) IS NOT NULL
  );

-- Se pueden editar o archivar mientras sigan pendientes.
DROP POLICY IF EXISTS "Users edit own pending change requests" ON public.app_change_log;
CREATE POLICY "Users edit own pending change requests" ON public.app_change_log
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (created_by = auth.uid() AND status = 'pending' AND version_id IS NULL)
  WITH CHECK (created_by = auth.uid() AND status IN ('pending', 'archived') AND version_id IS NULL);

-- ── Lectura de novedades ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_release_notes(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'seen_at', (
      SELECT COALESCE(p.release_notes_seen_at, p.created_at)
      FROM public.profiles p WHERE p.id = auth.uid()
    ),
    'versions', COALESCE((
      SELECT jsonb_agg(v.payload ORDER BY v.published_at DESC)
      FROM (
        SELECT av.published_at,
               jsonb_build_object(
                 'id', av.id,
                 'version_code', av.version_code,
                 'version_name', av.version_name,
                 'description', av.description,
                 'published_at', av.published_at,
                 'announce_mode', av.announce_mode,
                 'changes', ch.changes
               ) AS payload
        FROM public.app_versions av
        JOIN LATERAL (
          SELECT jsonb_agg(
                   jsonb_build_object(
                     'id', c.id,
                     'title', c.title,
                     'summary', c.user_summary,
                     'change_type', c.change_type,
                     'module', c.module
                   ) ORDER BY c.created_at
                 ) AS changes
          FROM public.app_change_log c
          WHERE c.version_id = av.id
            AND c.status = 'included'
            AND c.is_user_facing
        ) ch ON ch.changes IS NOT NULL
        WHERE av.status = 'published'
          AND av.published_at IS NOT NULL
          AND auth.uid() IS NOT NULL
        ORDER BY av.published_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
      ) v
    ), '[]'::jsonb)
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_release_notes(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_release_notes(integer) TO authenticated;

-- Nunca retrocede ni avanza más allá de ahora.
CREATE OR REPLACE FUNCTION public.mark_release_notes_seen(p_until timestamptz)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.profiles
  SET release_notes_seen_at = GREATEST(
    COALESCE(release_notes_seen_at, '-infinity'::timestamptz),
    LEAST(p_until, now())
  )
  WHERE id = auth.uid();
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_release_notes_seen(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_release_notes_seen(timestamptz) TO authenticated;
