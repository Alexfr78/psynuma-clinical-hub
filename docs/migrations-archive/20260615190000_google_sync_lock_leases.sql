-- Replace connection-scoped advisory locks with database-backed leases.
-- Separate PostgREST RPC calls can use different pooled connections.

CREATE TABLE IF NOT EXISTS public.google_sync_locks (
  professional_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  lock_token uuid NOT NULL,
  locked_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_sync_locks ENABLE ROW LEVEL SECURITY;

DROP FUNCTION IF EXISTS public.try_acquire_google_sync_lock(uuid);
DROP FUNCTION IF EXISTS public.release_google_sync_lock(uuid);

CREATE OR REPLACE FUNCTION public.try_acquire_google_sync_lock(
  p_professional_id uuid,
  p_lock_token uuid,
  p_lease_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_rows integer;
BEGIN
  INSERT INTO public.google_sync_locks (
    professional_id,
    lock_token,
    locked_until,
    updated_at
  )
  VALUES (
    p_professional_id,
    p_lock_token,
    now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
    now()
  )
  ON CONFLICT (professional_id) DO UPDATE
  SET lock_token = EXCLUDED.lock_token,
      locked_until = EXCLUDED.locked_until,
      updated_at = now()
  WHERE google_sync_locks.locked_until <= now();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_google_sync_lock(
  p_professional_id uuid,
  p_lock_token uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.google_sync_locks
  WHERE professional_id = p_professional_id
    AND lock_token = p_lock_token;
$$;

REVOKE ALL ON TABLE public.google_sync_locks FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.try_acquire_google_sync_lock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_google_sync_lock(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_google_sync_lock(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_google_sync_lock(uuid, uuid) TO service_role;
