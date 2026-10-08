-- Verifactu chain hardening.
--
-- 1. acquire_verifactu_chain_lock_v2 created the chain row without ultimo_hash
--    (NOT NULL), so the first Verifactu record of a center could never take the
--    lock. It also only inserted when the center had no row at all, so a center
--    whose NIF changed could never lock again. Now it inserts per (center, NIF)
--    with an empty hash (sign/cancel treat '' as "first record").
-- 2. Center admins could write verifactu_chain_status directly from the browser
--    (FOR ALL policy), which allowed clearing blocked_reason or rewriting
--    ultimo_hash without reconciling with the AEAT. Writes are now service-role
--    only; admins keep read access.

CREATE OR REPLACE FUNCTION public.acquire_verifactu_chain_lock_v2(
  p_center_id uuid,
  p_nif_emisor text DEFAULT NULL::text,
  p_lock_timeout_seconds integer DEFAULT 30
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lock_id text;
  v_updated int;
BEGIN
  v_lock_id := gen_random_uuid()::text;

  -- Try to acquire lock: only if not locked or lock has expired
  UPDATE public.verifactu_chain_status
  SET locked_at = now(),
      locked_by = v_lock_id
  WHERE center_id = p_center_id
    AND (p_nif_emisor IS NULL OR nif_emisor = p_nif_emisor)
    AND (locked_at IS NULL OR locked_at < now() - (p_lock_timeout_seconds || ' seconds')::interval);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    RAISE LOG '[VERIFACTU:LOCK_V2] Acquired lock % for center %', v_lock_id, p_center_id;
    RETURN v_lock_id;
  END IF;

  -- If no row exists yet for this center + NIF, insert one with the lock held
  IF NOT EXISTS (
    SELECT 1 FROM public.verifactu_chain_status
    WHERE center_id = p_center_id
      AND (p_nif_emisor IS NULL OR nif_emisor = p_nif_emisor)
  ) THEN
    INSERT INTO public.verifactu_chain_status
      (center_id, nif_emisor, id_sistema_informatico, numero_instalacion, ultimo_hash, locked_at, locked_by)
    VALUES (p_center_id, COALESCE(p_nif_emisor, ''), '01', 1, '', now(), v_lock_id)
    ON CONFLICT DO NOTHING;

    IF EXISTS (SELECT 1 FROM public.verifactu_chain_status WHERE center_id = p_center_id AND locked_by = v_lock_id) THEN
      RAISE LOG '[VERIFACTU:LOCK_V2] Acquired lock % for center % (new row)', v_lock_id, p_center_id;
      RETURN v_lock_id;
    END IF;
  END IF;

  RAISE LOG '[VERIFACTU:LOCK_V2] Failed to acquire lock for center % (held by another process)', p_center_id;
  RETURN NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.acquire_verifactu_chain_lock_v2(uuid, text, integer) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Centers can manage their chain status" ON public.verifactu_chain_status;
DROP POLICY IF EXISTS "Center admins can view their chain status" ON public.verifactu_chain_status;
CREATE POLICY "Center admins can view their chain status"
  ON public.verifactu_chain_status
  FOR SELECT
  TO authenticated
  USING (
    is_admin(auth.uid())
    AND center_id IN (SELECT p.center_id FROM profiles p WHERE p.id = auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.verifactu_chain_status FROM anon, authenticated;
