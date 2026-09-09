
-- 1. Repair orphan bonos: create missing debt records
INSERT INTO debts (patient_id, bono_id, amount, paid_amount, status, notes, center_id)
SELECT b.patient_id, b.id, b.total_price, 0, 'pending',
       'Bono: ' || b.name || ' (' || b.total_sessions || ' sesiones)',
       b.center_id
FROM bonos b
WHERE b.total_price > 0
  AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.bono_id = b.id)
  AND b.status != 'cancelled';

-- 2. Create transactional RPC for bono + debt creation
CREATE OR REPLACE FUNCTION public.create_bono_with_debt(
  p_patient_id uuid,
  p_name text,
  p_total_sessions integer,
  p_price_per_session numeric,
  p_total_price numeric,
  p_expires_at timestamptz DEFAULT NULL,
  p_center_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_center_id uuid;
  v_bono_id uuid;
  v_debt_id uuid;
BEGIN
  -- Resolve center_id
  v_user_center_id := COALESCE(p_center_id, get_user_center_id(auth.uid()));
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  -- Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Verify patient belongs to center
  IF NOT EXISTS (SELECT 1 FROM patients WHERE id = p_patient_id AND center_id = v_user_center_id) THEN
    RAISE EXCEPTION 'Patient not found or does not belong to your center';
  END IF;

  -- 1. Create bono
  INSERT INTO bonos (
    patient_id, center_id, name, total_sessions, 
    price_per_session, total_price, expires_at, 
    used_sessions, status
  ) VALUES (
    p_patient_id, v_user_center_id, p_name, p_total_sessions,
    p_price_per_session, p_total_price, p_expires_at,
    0, 'active'
  )
  RETURNING id INTO v_bono_id;

  -- 2. Create debt (only if price > 0)
  IF p_total_price > 0 THEN
    INSERT INTO debts (
      patient_id, bono_id, amount, paid_amount, 
      status, notes, center_id
    ) VALUES (
      p_patient_id, v_bono_id, p_total_price, 0,
      'pending',
      'Bono: ' || p_name || ' (' || p_total_sessions || ' sesiones)',
      v_user_center_id
    )
    RETURNING id INTO v_debt_id;
  END IF;

  RETURN jsonb_build_object(
    'bono_id', v_bono_id,
    'debt_id', v_debt_id
  );
END;
$$;
