CREATE OR REPLACE FUNCTION public.auto_complete_past_sessions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  updated_count integer;
  today_madrid date := (now() AT TIME ZONE 'Europe/Madrid')::date;
BEGIN
  UPDATE sessions s
  SET status = 'completed', updated_at = now()
  WHERE s.status IN ('scheduled', 'confirmed')
    AND s.session_date < today_madrid
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
    'today_madrid', today_madrid,
    'timestamp', now()
  );
END;
$function$;

SELECT public.auto_complete_past_sessions();