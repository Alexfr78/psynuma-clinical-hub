
-- Add optimistic lock columns to verifactu_chain_status
ALTER TABLE public.verifactu_chain_status 
  ADD COLUMN IF NOT EXISTS locked_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS locked_by text DEFAULT NULL;

-- Create a function to acquire the lock using row-level UPDATE (works with pgbouncer transaction mode)
CREATE OR REPLACE FUNCTION public.acquire_verifactu_chain_lock_v2(
  p_center_id uuid,
  p_nif_emisor text DEFAULT NULL,
  p_lock_timeout_seconds int DEFAULT 30
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  
  -- If no row exists yet, insert one with lock
  IF NOT EXISTS (SELECT 1 FROM public.verifactu_chain_status WHERE center_id = p_center_id) THEN
    INSERT INTO public.verifactu_chain_status (center_id, nif_emisor, id_sistema_informatico, numero_instalacion, locked_at, locked_by)
    VALUES (p_center_id, COALESCE(p_nif_emisor, ''), '01', 1, now(), v_lock_id)
    ON CONFLICT DO NOTHING;
    
    -- Check if we got it
    IF EXISTS (SELECT 1 FROM public.verifactu_chain_status WHERE center_id = p_center_id AND locked_by = v_lock_id) THEN
      RAISE LOG '[VERIFACTU:LOCK_V2] Acquired lock % for center % (new row)', v_lock_id, p_center_id;
      RETURN v_lock_id;
    END IF;
  END IF;
  
  RAISE LOG '[VERIFACTU:LOCK_V2] Failed to acquire lock for center % (held by another process)', p_center_id;
  RETURN NULL;
END;
$$;

-- Create a function to release the lock
CREATE OR REPLACE FUNCTION public.release_verifactu_chain_lock_v2(
  p_center_id uuid,
  p_lock_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.verifactu_chain_status
  SET locked_at = NULL,
      locked_by = NULL
  WHERE center_id = p_center_id
    AND locked_by = p_lock_id;
  
  RAISE LOG '[VERIFACTU:LOCK_V2] Released lock % for center %', p_lock_id, p_center_id;
END;
$$;
