-- Drop existing function
DROP FUNCTION IF EXISTS public.get_bono_sessions(uuid);

-- Recreate with explicit cast for enum status field
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
    s.status::text as session_status,
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