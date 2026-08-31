-- Bug: the public payment links (/cita/:token and /pagar/:token) offered bono
-- templates using their generic center-wide price, ignoring any patient-specific
-- tariff plan or custom price (patient_custom_prices / tariff_plan_items),
-- resolved via resolve_effective_price(). A patient with a special rate (e.g.
-- Sergi Cerezuela) saw the generic bono price instead of their own.
--
-- Fix: resolve each bono_template's price per-patient before returning it.

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_session(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.sessions s
  JOIN public.bono_templates bt
    ON bt.center_id = s.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public.resolve_effective_price(s.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE s.access_token = p_token
    AND s.status <> 'cancelled'
    AND COALESCE(s.payment_status, '') NOT IN ('paid', 'bono')
    AND s.stripe_payment_status IS DISTINCT FROM 'paid';

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_bono_templates_for_debt(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', bt.id,
        'name', bt.name,
        'total_sessions', bt.total_sessions,
        'total_price', rp.applied_price,
        'price_per_session', ROUND(rp.applied_price / bt.total_sessions, 2)
      )
      ORDER BY bt.total_sessions, bt.name
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.debts d
  JOIN public.bono_templates bt
    ON bt.center_id = d.center_id
   AND bt.is_active = true
   AND bt.is_public = true
  CROSS JOIN LATERAL (
    SELECT COALESCE(
      (public.resolve_effective_price(d.patient_id, 'bono_template', bt.id)->>'applied_price')::numeric(10,2),
      bt.total_price
    ) AS applied_price
  ) rp
  WHERE d.access_token = p_token
    AND d.status IN ('pending', 'partial');

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_bono_templates_for_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_bono_templates_for_session(text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_public_bono_templates_for_debt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_bono_templates_for_debt(text) TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_bono_templates_for_session(text)
IS 'Returns public active bono templates for a payable session token, priced per the patient''s resolved tariff (custom price > tariff plan > base).';

COMMENT ON FUNCTION public.get_public_bono_templates_for_debt(text)
IS 'Returns public active bono templates for a pending debt token, priced per the patient''s resolved tariff (custom price > tariff plan > base).';
