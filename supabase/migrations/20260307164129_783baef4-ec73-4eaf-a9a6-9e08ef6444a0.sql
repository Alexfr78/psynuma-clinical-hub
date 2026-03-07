-- Advisory lock functions for Verifactu chain concurrency control
CREATE OR REPLACE FUNCTION public.acquire_verifactu_chain_lock(p_center_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lock_id bigint;
  acquired boolean;
BEGIN
  lock_id := public.uuid_to_lock_id(p_center_id);
  SELECT pg_try_advisory_lock(54321, lock_id::int) INTO acquired;
  IF acquired THEN
    RAISE LOG '[VERIFACTU:LOCK] Acquired chain lock for center %', p_center_id;
  ELSE
    RAISE LOG '[VERIFACTU:LOCK] Chain lock already held for center %', p_center_id;
  END IF;
  RETURN acquired;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_verifactu_chain_lock(p_center_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  lock_id bigint;
BEGIN
  lock_id := public.uuid_to_lock_id(p_center_id);
  PERFORM pg_advisory_unlock(54321, lock_id::int);
  RAISE LOG '[VERIFACTU:LOCK] Released chain lock for center %', p_center_id;
END;
$$;