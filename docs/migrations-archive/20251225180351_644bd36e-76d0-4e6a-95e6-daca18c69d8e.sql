-- Drop existing function
DROP FUNCTION IF EXISTS public.get_bono_sessions(uuid);

-- Recreate with correct column names (session_date, not date)
CREATE OR REPLACE FUNCTION public.get_bono_sessions(p_bono_id uuid)
RETURNS TABLE(
  session_id uuid,
  session_date date,
  session_status text,
  patient_name text,
  professional_name text,
  session_type_name text,
  consumes_bono boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as session_id,
    s.session_date as session_date,
    s.status as session_status,
    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
    CONCAT(pr.first_name, ' ', pr.last_name) as professional_name,
    s.session_type as session_type_name,
    EXISTS(SELECT 1 FROM bono_items bi WHERE bi.bono_id = p_bono_id AND bi.session_id = s.id) as consumes_bono
  FROM sessions s
  LEFT JOIN patients p ON s.patient_id = p.id
  LEFT JOIN profiles pr ON s.professional_id = pr.id
  WHERE s.bono_id = p_bono_id
     OR EXISTS(SELECT 1 FROM bono_items bi WHERE bi.bono_id = p_bono_id AND bi.session_id = s.id)
  ORDER BY s.session_date DESC, s.start_time DESC;
END;
$$;

-- Fix sessions that have bono_items but missing bono_id
UPDATE sessions s
SET bono_id = bi.bono_id, updated_at = now()
FROM bono_items bi
WHERE bi.session_id = s.id
AND s.bono_id IS NULL;

-- Delete inconsistent bono_items (where session.bono_id doesn't match)
DELETE FROM bono_items bi
WHERE EXISTS (
  SELECT 1 FROM sessions s 
  WHERE s.id = bi.session_id 
  AND s.bono_id IS NOT NULL 
  AND s.bono_id != bi.bono_id
);

-- Recalculate used_sessions from actual bono_items
UPDATE bonos b
SET used_sessions = COALESCE((
  SELECT COUNT(DISTINCT bi.session_id) 
  FROM bono_items bi 
  WHERE bi.bono_id = b.id
), 0),
updated_at = now()
WHERE used_sessions IS DISTINCT FROM COALESCE((
  SELECT COUNT(DISTINCT bi.session_id) 
  FROM bono_items bi 
  WHERE bi.bono_id = b.id
), 0);

-- Add unique constraint to prevent a session consuming multiple bonos
CREATE UNIQUE INDEX IF NOT EXISTS bono_items_session_id_unique ON bono_items(session_id);