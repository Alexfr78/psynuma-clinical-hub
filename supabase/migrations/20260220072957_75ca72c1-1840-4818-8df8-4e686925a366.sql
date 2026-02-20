
-- Function to auto-complete past sessions with no pending debt
CREATE OR REPLACE FUNCTION public.auto_complete_past_sessions()
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
