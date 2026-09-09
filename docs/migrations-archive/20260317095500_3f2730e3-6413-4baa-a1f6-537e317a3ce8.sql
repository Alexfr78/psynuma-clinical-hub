-- Fix auto_complete_past_sessions: don't complete sessions with pending payments and no debt
CREATE OR REPLACE FUNCTION auto_complete_past_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE sessions s
  SET status = 'completed', updated_at = now()
  WHERE s.status IN ('scheduled', 'confirmed')
    AND s.session_date < CURRENT_DATE
    AND (
      s.price = 0
      OR s.payment_status = 'paid'
      OR EXISTS (SELECT 1 FROM debts d WHERE d.session_id = s.id AND d.status = 'paid')
    )
    AND NOT EXISTS (
      SELECT 1 FROM debts d
      WHERE d.session_id = s.id
        AND d.status IN ('pending', 'partial')
    );

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated', updated_count,
    'timestamp', now()
  );
END;
$$;

-- Create DB-level debt generation function as resilient fallback
CREATE OR REPLACE FUNCTION generate_pending_debts_db()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_count integer := 0;
BEGIN
  INSERT INTO debts (patient_id, center_id, session_id, amount, paid_amount, status, due_date, notes)
  SELECT
    s.patient_id,
    s.center_id,
    s.id,
    s.price,
    0,
    'pending',
    s.session_date,
    'Deuda generada automáticamente para sesión del ' || s.session_date::text
  FROM sessions s
  WHERE s.session_date < CURRENT_DATE
    AND s.payment_status = 'pending'
    AND s.status NOT IN ('cancelled', 'no_show', 'blocked')
    AND s.bono_id IS NULL
    AND s.price > 0
    AND NOT EXISTS (SELECT 1 FROM debts d WHERE d.session_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.session_id = s.id);

  GET DIAGNOSTICS created_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'created', created_count,
    'timestamp', now()
  );
END;
$$