
-- Backfill: sesiones que el fallback del webhook dejó a medias (enlazadas al
-- bono con payment_status 'bono' y su deuda todavía abierta).
DO $backfill$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS session_id, s.bono_id
    FROM public.sessions s
    JOIN public.bono_items bi ON bi.session_id = s.id AND bi.bono_id = s.bono_id
    WHERE s.bono_id IS NOT NULL
      AND s.payment_status = 'bono'
  LOOP
    PERFORM public.apply_bono_to_session_service(r.bono_id, r.session_id);
  END LOOP;

  -- El fallback fijaba used_sessions = 1 sin mirar el contador previo.
  UPDATE public.bonos b
  SET used_sessions = sub.cnt,
      status = CASE
        WHEN sub.cnt >= COALESCE(b.total_sessions, 0) THEN 'exhausted'
        WHEN b.status = 'exhausted' THEN 'active'
        ELSE b.status
      END,
      updated_at = now()
  FROM (
    SELECT bono_id, COUNT(*)::int AS cnt
    FROM public.bono_items
    GROUP BY bono_id
  ) sub
  WHERE b.id = sub.bono_id
    AND b.stripe_checkout_session_id IS NOT NULL
    AND COALESCE(b.used_sessions, 0) <> sub.cnt;
END;
$backfill$;
