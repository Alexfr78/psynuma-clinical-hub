-- SECURITY FIX: Address 4 critical security vulnerabilities
-- 1. Centers OAuth credentials exposure via token-based RLS
-- 2. SECURITY DEFINER functions missing authorization checks
-- 3. Profiles table professional data exposure
-- 4. Patients table sensitive data exposure

-- =========================================================================
-- PART 1: Create secure views for public/token-based access
-- =========================================================================

-- Create a secure view for centers that excludes sensitive columns
CREATE OR REPLACE VIEW public.centers_public AS
SELECT 
  id,
  name,
  address,
  address_details,
  city,
  postal_code,
  province,
  country,
  phone,
  email,
  logo_url,
  invoice_logo_url,
  invoice_footer,
  portal_enabled,
  portal_slug,
  portal_require_approval,
  portal_allow_professional_selection,
  reschedule_max_days,
  reschedule_slot_duration,
  reschedule_require_confirmation,
  public_booking_enabled,
  consent_expiration_days,
  default_tax_rate,
  default_tax_name,
  include_tax_in_price,
  retention_rate,
  retention_name
FROM public.centers;

-- Create a secure view for profiles that excludes sensitive contact info
CREATE OR REPLACE VIEW public.profiles_public AS
SELECT 
  id,
  center_id,
  first_name,
  last_name,
  specialty,
  is_active,
  avatar_url
FROM public.profiles;

-- Create a secure view for patients that shows only minimal info for public contexts
CREATE OR REPLACE VIEW public.patients_public AS
SELECT 
  id,
  center_id,
  first_name,
  last_name,
  is_minor
FROM public.patients;

-- =========================================================================
-- PART 2: Drop insecure token-based policies on centers table
-- =========================================================================

DROP POLICY IF EXISTS "Public read center via invoice token" ON public.centers;
DROP POLICY IF EXISTS "Public read center via validated session token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid invoice token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid session token" ON public.centers;
DROP POLICY IF EXISTS "Anon read limited center by valid consent token" ON public.centers;

-- =========================================================================
-- PART 3: Drop insecure token-based policies on profiles table
-- =========================================================================

DROP POLICY IF EXISTS "Anon read professional by valid consent token" ON public.profiles;
DROP POLICY IF EXISTS "Anon read professional by valid session token" ON public.profiles;
DROP POLICY IF EXISTS "Public read professional via validated session token" ON public.profiles;

-- =========================================================================
-- PART 4: Drop redundant token-based policies on patients (keep through views)
-- =========================================================================

DROP POLICY IF EXISTS "Anon read patient by valid consent token" ON public.patients;
DROP POLICY IF EXISTS "Anon read patient by valid invoice token" ON public.patients;
DROP POLICY IF EXISTS "Anon read patient by valid session token" ON public.patients;
DROP POLICY IF EXISTS "Public read patient via validated session token" ON public.patients;

-- =========================================================================
-- PART 5: Grant access to the views
-- =========================================================================

GRANT SELECT ON public.centers_public TO anon, authenticated;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.patients_public TO anon, authenticated;

-- =========================================================================
-- PART 6: Create secure functions that return only safe data
-- =========================================================================

-- Function to get safe center info for public contexts
CREATE OR REPLACE FUNCTION public.get_center_for_session_token(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'address', c.address,
    'city', c.city,
    'postal_code', c.postal_code,
    'phone', c.phone,
    'email', c.email,
    'logo_url', c.logo_url
  ) INTO v_result
  FROM centers c
  JOIN sessions s ON s.center_id = c.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$$;

-- Function to get safe professional info for public contexts  
CREATE OR REPLACE FUNCTION public.get_professional_for_session_token(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', pr.id,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'specialty', pr.specialty,
    'avatar_url', pr.avatar_url
  ) INTO v_result
  FROM profiles pr
  JOIN sessions s ON s.professional_id = pr.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$$;

-- Function to get safe patient info for public contexts
CREATE OR REPLACE FUNCTION public.get_patient_for_session_token(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', p.id,
    'first_name', p.first_name,
    'last_name', p.last_name,
    'is_minor', p.is_minor
  ) INTO v_result
  FROM patients p
  JOIN sessions s ON s.patient_id = p.id
  WHERE s.id = p_session_id;
  
  RETURN v_result;
END;
$$;

-- =========================================================================
-- PART 7: Fix SECURITY DEFINER functions - Add authorization checks
-- =========================================================================

-- Secure apply_bono_to_session with center validation
CREATE OR REPLACE FUNCTION public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_bono record;
  v_session_center_id uuid;
  v_inserted boolean := false;
  v_debt_deleted boolean := false;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- Lock bono row and verify center ownership
  SELECT * INTO v_bono
  FROM public.bonos
  WHERE id = p_bono_id AND center_id = v_user_center_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bono no existe o no pertenece a tu centro';
  END IF;

  -- SECURITY CHECK: Verify session belongs to same center
  SELECT center_id INTO v_session_center_id
  FROM public.sessions
  WHERE id = p_session_id;
  
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono.status IS NOT NULL AND v_bono.status NOT IN ('active') THEN
    RAISE EXCEPTION 'Bono no está activo';
  END IF;

  IF COALESCE(v_bono.used_sessions, 0) >= COALESCE(v_bono.total_sessions, 0) THEN
    RAISE EXCEPTION 'Bono sin sesiones disponibles';
  END IF;

  -- Insert consumption if not exists
  BEGIN
    INSERT INTO public.bono_items (bono_id, session_id, created_at)
    VALUES (p_bono_id, p_session_id, now());
    v_inserted := true;
  EXCEPTION WHEN unique_violation THEN
    v_inserted := false;
  END;

  -- Link bono to session AND set price to 0 (covered by bono)
  UPDATE public.sessions
  SET bono_id = p_bono_id,
      price = 0,
      payment_status = 'paid',
      updated_at = now()
  WHERE id = p_session_id;

  -- Delete or update the existing debt for this session
  DELETE FROM public.debts
  WHERE session_id = p_session_id
    AND (paid_amount IS NULL OR paid_amount = 0)
    AND invoice_id IS NULL;
  
  IF FOUND THEN
    v_debt_deleted := true;
  ELSE
    UPDATE public.debts
    SET amount = 0,
        status = 'paid',
        notes = COALESCE(notes, '') || ' (Cubierto por bono)',
        updated_at = now()
    WHERE session_id = p_session_id
      AND status != 'paid';
  END IF;

  -- Update billable events
  UPDATE public.billable_events
  SET amount = 0,
      billing_status = 'paid',
      updated_at = now()
  WHERE session_id = p_session_id;

  IF v_inserted THEN
    UPDATE public.bonos
    SET used_sessions = COALESCE(used_sessions, 0) + 1,
        updated_at = now()
    WHERE id = p_bono_id;

    UPDATE public.bonos
    SET status = CASE
      WHEN COALESCE(used_sessions, 0) >= COALESCE(total_sessions, 0) THEN 'exhausted'
      ELSE status
    END
    WHERE id = p_bono_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'debt_deleted', v_debt_deleted
  );
END;
$$;

-- Secure remove_bono_from_session with center validation
CREATE OR REPLACE FUNCTION public.remove_bono_from_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_session_center_id uuid;
  v_bono_id uuid;
  v_deleted boolean := false;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- SECURITY CHECK: Verify session belongs to caller's center
  SELECT center_id, bono_id INTO v_session_center_id, v_bono_id
  FROM public.sessions
  WHERE id = p_session_id;
  
  IF v_session_center_id IS NULL OR v_session_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Sesión no existe o no pertenece a tu centro';
  END IF;

  IF v_bono_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'deleted', false, 'reason', 'no_bono_linked');
  END IF;

  -- Delete consumption row if exists
  DELETE FROM public.bono_items
  WHERE session_id = p_session_id AND bono_id = v_bono_id
  RETURNING true INTO v_deleted;

  -- Unlink session
  UPDATE public.sessions
  SET bono_id = NULL,
      updated_at = now()
  WHERE id = p_session_id;

  -- Decrement only if we actually deleted a consumption row
  IF v_deleted THEN
    UPDATE public.bonos
    SET used_sessions = GREATEST(COALESCE(used_sessions, 0) - 1, 0),
        status = 'active',
        updated_at = now()
    WHERE id = v_bono_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END;
$$;

-- Secure delete_bono_safely with center validation
CREATE OR REPLACE FUNCTION public.delete_bono_safely(p_bono_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_bono RECORD;
  v_result jsonb;
  v_affected_sessions int;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Not authenticated or no center assigned'
    );
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient permissions: requires professional or admin role'
    );
  END IF;

  -- Lock bono and verify center ownership
  SELECT id, name, total_sessions, used_sessions, status, patient_id, center_id
  INTO v_bono
  FROM bonos
  WHERE id = p_bono_id AND center_id = v_user_center_id
  FOR UPDATE;

  IF v_bono.id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Bono no encontrado o no pertenece a tu centro'
    );
  END IF;

  IF v_bono.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El bono ya está cancelado'
    );
  END IF;

  -- Case 1: No sessions consumed - physical deletion
  IF v_bono.used_sessions = 0 OR v_bono.used_sessions IS NULL THEN
    UPDATE sessions 
    SET bono_id = NULL, updated_at = now()
    WHERE bono_id = p_bono_id;
    
    GET DIAGNOSTICS v_affected_sessions = ROW_COUNT;

    DELETE FROM bono_items WHERE bono_id = p_bono_id;
    DELETE FROM bonos WHERE id = p_bono_id;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'deleted',
      'message', 'Bono eliminado permanentemente',
      'bono_name', v_bono.name,
      'sessions_unlinked', v_affected_sessions
    );

  -- Case 2: With consumed sessions - soft delete
  ELSE
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

-- Secure get_bono_sessions with center validation
CREATE OR REPLACE FUNCTION public.get_bono_sessions(p_bono_id uuid)
RETURNS TABLE(session_id uuid, session_date date, session_status text, patient_name text, professional_name text, session_type_name text, consumes_bono boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_bono_center_id uuid;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  -- SECURITY CHECK: Verify bono belongs to caller's center
  SELECT center_id INTO v_bono_center_id
  FROM bonos
  WHERE id = p_bono_id;
  
  IF v_bono_center_id IS NULL OR v_bono_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Bono no encontrado o no pertenece a tu centro';
  END IF;

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

-- Secure recompute_debt_by_invoice with center validation
CREATE OR REPLACE FUNCTION public.recompute_debt_by_invoice(p_debt_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_debt_center_id uuid;
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_paid_sum numeric;
  v_new_status text;
  v_result jsonb;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;

  -- SECURITY CHECK: Verify debt belongs to caller's center
  SELECT center_id, invoice_id INTO v_debt_center_id, v_invoice_id
  FROM debts
  WHERE id = p_debt_id;
  
  IF v_debt_center_id IS NULL OR v_debt_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Debt not found or does not belong to your center';
  END IF;

  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Debt % has no invoice_id', p_debt_id;
  END IF;

  SELECT total INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_sum
  FROM payments
  WHERE invoice_id = v_invoice_id;

  IF v_paid_sum >= v_invoice_total THEN
    v_new_status := 'paid';
  ELSIF v_paid_sum > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE debts
  SET 
    paid_amount = v_paid_sum,
    status = v_new_status::payment_status,
    updated_at = now()
  WHERE id = p_debt_id;

  v_result := jsonb_build_object(
    'debt_id', p_debt_id,
    'invoice_id', v_invoice_id,
    'invoice_total', v_invoice_total,
    'paid_amount', v_paid_sum,
    'status', v_new_status
  );

  RETURN v_result;
END;
$$;

-- Secure delete_payment_and_recompute_debt_v2 with center validation
CREATE OR REPLACE FUNCTION public.delete_payment_and_recompute_debt_v2(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- SECURITY CHECK: Verify payment belongs to caller's center
  SELECT center_id INTO v_payment_center_id
  FROM payments
  WHERE id = p_payment_id;
  
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.get_debt_id_for_payment_by_invoice(p_payment_id);

  DELETE FROM public.payments WHERE id = p_payment_id;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$$;

-- Secure update_payment_and_recompute_debt_v2 with center validation
CREATE OR REPLACE FUNCTION public.update_payment_and_recompute_debt_v2(
  p_payment_id uuid, 
  p_amount numeric, 
  p_payment_date timestamp with time zone, 
  p_payment_method text, 
  p_reference text DEFAULT NULL, 
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_payment_center_id uuid;
  v_debt_id uuid;
BEGIN
  -- SECURITY CHECK: Get caller's center
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  
  -- SECURITY CHECK: Verify caller has appropriate role
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  -- SECURITY CHECK: Verify payment belongs to caller's center
  SELECT center_id INTO v_payment_center_id
  FROM payments
  WHERE id = p_payment_id;
  
  IF v_payment_center_id IS NULL OR v_payment_center_id != v_user_center_id THEN
    RAISE EXCEPTION 'Payment not found or does not belong to your center';
  END IF;

  v_debt_id := public.get_debt_id_for_payment_by_invoice(p_payment_id);

  UPDATE public.payments
  SET amount = p_amount,
      payment_date = p_payment_date,
      payment_method = p_payment_method,
      reference = p_reference,
      notes = p_notes,
      updated_at = now()
  WHERE id = p_payment_id;

  RETURN public.recompute_debt_by_invoice(v_debt_id);
END;
$$;

-- =========================================================================
-- PART 8: Grant execute permissions on secure functions
-- =========================================================================

GRANT EXECUTE ON FUNCTION public.get_center_for_session_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_for_session_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_patient_for_session_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_bono_to_session(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_bono_from_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_bono_safely(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bono_sessions(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_debt_by_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment_and_recompute_debt_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_and_recompute_debt_v2(uuid, numeric, timestamp with time zone, text, text, text) TO authenticated;