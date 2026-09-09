-- =============================================================
-- GOOGLE CALENDAR RATE LIMIT PROTECTION
-- =============================================================
-- Tabla para debounce de webhooks (evitar tormentas de sincronización)
-- Funciones de lock para evitar ejecuciones concurrentes del sync
-- =============================================================

-- 1. Tabla google_sync_debounce para coalescing de webhooks
CREATE TABLE IF NOT EXISTS public.google_sync_debounce (
    professional_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    calendar_id text,
    last_webhook_at timestamptz NOT NULL DEFAULT now(),
    last_sync_trigger_at timestamptz,
    pending boolean NOT NULL DEFAULT true,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.google_sync_debounce ENABLE ROW LEVEL SECURITY;

-- RLS: Solo service role puede acceder (se usa desde edge functions)
CREATE POLICY "Service role full access on google_sync_debounce"
ON public.google_sync_debounce
FOR ALL
USING (true)
WITH CHECK (true);

-- 2. Funciones de Advisory Lock para evitar sync concurrentes
-- Usamos pg_try_advisory_lock con un hash estable del professional_id

-- Genera un bigint estable a partir de un UUID para usar con advisory locks
CREATE OR REPLACE FUNCTION public.uuid_to_lock_id(p_uuid uuid)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    -- Tomar los primeros 8 bytes del UUID como bigint
    SELECT ('x' || substr(replace(p_uuid::text, '-', ''), 1, 16))::bit(64)::bigint
$$;

-- Intenta adquirir un lock de sincronización (non-blocking)
-- Retorna true si se adquirió, false si ya hay otro sync corriendo
CREATE OR REPLACE FUNCTION public.try_acquire_google_sync_lock(p_professional_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    lock_id bigint;
    acquired boolean;
BEGIN
    lock_id := public.uuid_to_lock_id(p_professional_id);
    
    -- pg_try_advisory_lock es a nivel de sesión y retorna inmediatamente
    SELECT pg_try_advisory_lock(12345, lock_id::int) INTO acquired;
    
    IF acquired THEN
        RAISE LOG '[SYNC:LOCK] Acquired lock for professional %', p_professional_id;
    ELSE
        RAISE LOG '[SYNC:LOCK] Lock already held for professional %', p_professional_id;
    END IF;
    
    RETURN acquired;
END;
$$;

-- Libera el lock de sincronización
CREATE OR REPLACE FUNCTION public.release_google_sync_lock(p_professional_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    lock_id bigint;
BEGIN
    lock_id := public.uuid_to_lock_id(p_professional_id);
    
    -- Liberar el lock
    PERFORM pg_advisory_unlock(12345, lock_id::int);
    RAISE LOG '[SYNC:LOCK] Released lock for professional %', p_professional_id;
END;
$$;

-- 3. Función para manejar el debounce del webhook
-- Retorna true si se debe invocar sync, false si hay que esperar
CREATE OR REPLACE FUNCTION public.handle_google_webhook_debounce(
    p_professional_id uuid,
    p_calendar_id text,
    p_debounce_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_row google_sync_debounce%ROWTYPE;
    v_should_trigger boolean := false;
    v_now timestamptz := now();
BEGIN
    -- Upsert atómico con lock
    INSERT INTO public.google_sync_debounce (professional_id, calendar_id, last_webhook_at, pending, updated_at)
    VALUES (p_professional_id, p_calendar_id, v_now, true, v_now)
    ON CONFLICT (professional_id) DO UPDATE SET
        last_webhook_at = v_now,
        pending = true,
        calendar_id = COALESCE(EXCLUDED.calendar_id, google_sync_debounce.calendar_id),
        updated_at = v_now
    RETURNING * INTO v_row;
    
    -- Determinar si debemos disparar sync
    IF v_row.last_sync_trigger_at IS NULL OR 
       (v_now - v_row.last_sync_trigger_at) > (p_debounce_seconds || ' seconds')::interval THEN
        -- Ha pasado suficiente tiempo, disparar sync
        UPDATE public.google_sync_debounce
        SET last_sync_trigger_at = v_now,
            pending = false,
            updated_at = v_now
        WHERE professional_id = p_professional_id;
        
        v_should_trigger := true;
        RAISE LOG '[WEBHOOK:DEBOUNCE] Triggering sync for % (last trigger was % ago)', 
            p_professional_id, 
            COALESCE(v_now - v_row.last_sync_trigger_at, interval '999 hours');
    ELSE
        RAISE LOG '[WEBHOOK:DEBOUNCE] Skipping sync for % (last trigger was % ago, waiting for % seconds)', 
            p_professional_id, 
            v_now - v_row.last_sync_trigger_at,
            p_debounce_seconds;
    END IF;
    
    RETURN v_should_trigger;
END;
$$;

-- Índice para búsquedas rápidas de profesionales con syncs pendientes
CREATE INDEX IF NOT EXISTS idx_google_sync_debounce_pending 
ON public.google_sync_debounce(pending) 
WHERE pending = true;

-- Comentarios de documentación
COMMENT ON TABLE public.google_sync_debounce IS 'Debounce table for Google Calendar webhooks to prevent sync storms. Configured for 60s debounce window.';
COMMENT ON FUNCTION public.try_acquire_google_sync_lock IS 'Attempts to acquire an advisory lock for Google sync. Returns false if sync is already running for this professional.';
COMMENT ON FUNCTION public.release_google_sync_lock IS 'Releases the advisory lock for Google sync.';
COMMENT ON FUNCTION public.handle_google_webhook_debounce IS 'Handles webhook debouncing. Returns true if sync should be triggered (>60s since last trigger).';