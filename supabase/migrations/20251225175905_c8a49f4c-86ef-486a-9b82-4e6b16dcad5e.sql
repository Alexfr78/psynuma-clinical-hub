-- Drop existing function to change return type
DROP FUNCTION IF EXISTS public.get_bono_sessions(uuid);

-- Recreate with correct date type
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
    s.date as session_date,
    s.status as session_status,
    CONCAT(p.first_name, ' ', p.last_name) as patient_name,
    CONCAT(pr.first_name, ' ', pr.last_name) as professional_name,
    st.name as session_type_name,
    EXISTS(SELECT 1 FROM bono_items bi WHERE bi.bono_id = p_bono_id AND bi.session_id = s.id) as consumes_bono
  FROM sessions s
  LEFT JOIN patients p ON s.patient_id = p.id
  LEFT JOIN profiles pr ON s.professional_id = pr.id
  LEFT JOIN session_types st ON s.session_type_id = st.id
  WHERE s.bono_id = p_bono_id
  ORDER BY s.date DESC;
END;
$$;

-- Sync used_sessions counters with actual bono_items
UPDATE bonos b
SET used_sessions = COALESCE((
  SELECT COUNT(DISTINCT bi.session_id) 
  FROM bono_items bi 
  WHERE bi.bono_id = b.id
), 0)
WHERE used_sessions IS DISTINCT FROM COALESCE((
  SELECT COUNT(DISTINCT bi.session_id) 
  FROM bono_items bi 
  WHERE bi.bono_id = b.id
), 0);

-- Link sessions that have bono_items but missing bono_id
UPDATE sessions s
SET bono_id = bi.bono_id
FROM bono_items bi
WHERE bi.session_id = s.id
AND s.bono_id IS NULL;