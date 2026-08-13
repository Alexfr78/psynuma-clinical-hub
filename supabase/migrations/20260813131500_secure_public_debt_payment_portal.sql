-- Resolve public payment links through narrow token-scoped functions rather
-- than granting anonymous SELECT on clinical and financial tables.

CREATE OR REPLACE FUNCTION public.get_public_debt_by_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', d.id,
    'amount', d.amount,
    'paid_amount', d.paid_amount,
    'status', d.status,
    'created_at', d.created_at,
    'center_id', d.center_id,
    'patient', jsonb_build_object(
      'first_name', p.first_name,
      'last_name', p.last_name
    ),
    'session', CASE
      WHEN s.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', s.id,
        'session_date', s.session_date,
        'session_type', s.session_type
      )
    END,
    'center', jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'bizum_phone', c.bizum_phone,
      'has_stripe', EXISTS (
        SELECT 1
        FROM public.oauth_connections oc
        WHERE oc.professional_id = COALESCE(
          s.professional_id,
          p.assigned_professional_id,
          c.portal_default_professional_id
        )
          AND oc.provider = 'stripe'
          AND oc.stripe_account_id IS NOT NULL
          AND oc.stripe_account_status = 'active'
      )
    )
  )
  FROM public.debts d
  JOIN public.patients p ON p.id = d.patient_id
  JOIN public.centers c ON c.id = d.center_id
  LEFT JOIN public.sessions s ON s.id = d.session_id
  WHERE d.access_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_debt(p_token text)
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
  FROM public.debts d
  JOIN public.bono_templates bt
    ON bt.center_id = d.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  WHERE d.access_token = p_token
    AND d.status IN ('pending', 'partial');
$$;

REVOKE ALL ON FUNCTION public.get_public_debt_by_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_bono_templates_for_debt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_debt_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_bono_templates_for_debt(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_debt_by_token(text)
IS 'Returns the minimal payment-portal projection for one unguessable debt token.';

COMMENT ON FUNCTION public.get_public_bono_templates_for_debt(text)
IS 'Returns public active bono templates only when a pending debt token belongs to the same center.';
