CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_session(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', bt.total_price,
        'price_per_session', bt.price_per_session
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  FROM public.sessions s
  JOIN public.bono_templates bt
    ON bt.center_id = s.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  WHERE s.access_token = p_token
    AND s.status <> 'cancelled'
    AND COALESCE(s.payment_status, '') NOT IN ('paid', 'bono')
    AND s.stripe_payment_status IS DISTINCT FROM 'paid';
$$;

REVOKE ALL ON FUNCTION public.get_public_bono_templates_for_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_bono_templates_for_session(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_bono_templates_for_session(text)
IS 'Returns public active bono templates only when a payable session token belongs to the same center.';