-- Función para eliminar bonos de forma segura
-- Si used_sessions = 0: elimina físicamente y desvincula sesiones
-- Si used_sessions > 0: soft delete (status = 'cancelled')

CREATE OR REPLACE FUNCTION public.delete_bono_safely(p_bono_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bono RECORD;
  v_result jsonb;
  v_affected_sessions int;
BEGIN
  -- Bloquear el bono para evitar race conditions
  SELECT id, name, total_sessions, used_sessions, status, patient_id
  INTO v_bono
  FROM bonos
  WHERE id = p_bono_id
  FOR UPDATE;

  IF v_bono.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bono no encontrado'
    );
  END IF;

  -- No permitir eliminar bonos ya cancelados
  IF v_bono.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El bono ya está cancelado'
    );
  END IF;

  -- Caso 1: Sin sesiones consumidas - eliminación física
  IF v_bono.used_sessions = 0 OR v_bono.used_sessions IS NULL THEN
    -- Desvincular sesiones que tengan este bono_id pero no tengan consumo registrado
    UPDATE sessions 
    SET bono_id = NULL, updated_at = now()
    WHERE bono_id = p_bono_id;
    
    GET DIAGNOSTICS v_affected_sessions = ROW_COUNT;

    -- Eliminar items del bono (no debería haber si used_sessions = 0, pero por seguridad)
    DELETE FROM bono_items WHERE bono_id = p_bono_id;

    -- Eliminar el bono físicamente
    DELETE FROM bonos WHERE id = p_bono_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'deleted',
      'message', 'Bono eliminado permanentemente',
      'bono_name', v_bono.name,
      'sessions_unlinked', v_affected_sessions
    );

  -- Caso 2: Con sesiones consumidas - soft delete
  ELSE
    -- Cambiar estado a cancelado (soft delete)
    UPDATE bonos 
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_bono_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'cancelled',
      'message', 'Bono cancelado (mantiene historial)',
      'bono_name', v_bono.name,
      'used_sessions', v_bono.used_sessions,
      'total_sessions', v_bono.total_sessions
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Función para obtener las sesiones vinculadas a un bono
CREATE OR REPLACE FUNCTION public.get_bono_sessions(p_bono_id uuid)
RETURNS TABLE (
  session_id uuid,
  session_date timestamptz,
  session_status text,
  patient_first_name text,
  patient_last_name text,
  professional_first_name text,
  professional_last_name text,
  consumes_bono boolean,
  consumed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id as session_id,
    s.session_date,
    s.status as session_status,
    p.first_name as patient_first_name,
    p.last_name as patient_last_name,
    prof.first_name as professional_first_name,
    prof.last_name as professional_last_name,
    CASE WHEN bi.id IS NOT NULL THEN true ELSE false END as consumes_bono,
    bi.used_at as consumed_at
  FROM sessions s
  LEFT JOIN patients p ON s.patient_id = p.id
  LEFT JOIN profiles prof ON s.professional_id = prof.id
  LEFT JOIN bono_items bi ON bi.session_id = s.id AND bi.bono_id = p_bono_id
  WHERE s.bono_id = p_bono_id OR bi.bono_id = p_bono_id
  ORDER BY s.session_date DESC;
END;
$$;