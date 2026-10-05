-- Recalcula el precio de las citas futuras de un paciente con su tarifa vigente.
-- El precio se fija al crear la cita (trigger trg_apply_resolved_price), así que
-- una tarifa creada o cambiada después no llegaba a las citas ya programadas.
--
-- Solo toca citas sin dinero movido: sin bono, pendientes de pago y sin deuda,
-- cobro, evento facturable ni cargo de cancelación. Con p_apply = false solo
-- devuelve la lista para que la UI la enseñe antes de confirmar.
CREATE OR REPLACE FUNCTION public.reprice_future_sessions(
  p_patient_id uuid,
  p_apply boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_center_id uuid;
  v_today date := (now() AT TIME ZONE 'Europe/Madrid')::date;
  v_row record;
  v_resolved jsonb;
  v_new_price numeric;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  v_center_id := get_user_center_id(auth.uid());
  IF v_center_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated or no center assigned';
  END IF;
  IF NOT (is_professional(auth.uid()) OR is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Insufficient permissions: requires professional or admin role';
  END IF;

  FOR v_row IN
    SELECT s.id, s.session_date, s.start_time, s.session_type_id, s.price,
           st.name AS session_type_name
    FROM public.sessions s
    LEFT JOIN public.session_types st ON st.id = s.session_type_id
    WHERE s.patient_id = p_patient_id
      AND s.center_id = v_center_id
      AND s.session_date >= v_today
      AND s.status IN ('scheduled', 'confirmed', 'draft')
      AND s.session_type_id IS NOT NULL
      AND s.bono_id IS NULL
      AND s.payment_status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM public.debts d WHERE d.session_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.payments p WHERE p.session_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.billable_events be WHERE be.session_id = s.id)
      AND NOT EXISTS (SELECT 1 FROM public.cancellation_charges cc WHERE cc.session_id = s.id)
    ORDER BY s.session_date, s.start_time
    FOR UPDATE OF s
  LOOP
    v_resolved := resolve_effective_price(p_patient_id, 'session_type', v_row.session_type_id, v_row.session_date);
    IF v_resolved IS NULL THEN
      CONTINUE;
    END IF;
    v_new_price := (v_resolved->>'applied_price')::numeric;
    IF v_new_price IS NULL OR v_new_price = v_row.price THEN
      CONTINUE;
    END IF;

    v_changes := v_changes || jsonb_build_object(
      'session_id', v_row.id,
      'session_date', v_row.session_date,
      'start_time', v_row.start_time,
      'session_type_name', v_row.session_type_name,
      'old_price', v_row.price,
      'new_price', v_new_price,
      'pricing_source', v_resolved->>'pricing_source'
    );

    IF p_apply THEN
      UPDATE public.sessions
      SET price = v_new_price,
          base_price_snapshot = NULLIF(v_resolved->>'base_price', '')::numeric,
          pricing_source = COALESCE(NULLIF(v_resolved->>'pricing_source', ''), 'base'),
          custom_price_id = NULLIF(v_resolved->>'custom_price_id', '')::uuid,
          tariff_plan_id_snapshot = NULLIF(v_resolved->>'tariff_plan_id', '')::uuid,
          tariff_plan_assignment_id_snapshot = NULLIF(v_resolved->>'tariff_plan_assignment_id', '')::uuid,
          payment_status = CASE WHEN v_new_price > 0 THEN 'pending' ELSE 'paid' END
      WHERE id = v_row.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('applied', p_apply, 'sessions', v_changes);
END;
$function$;

REVOKE ALL ON FUNCTION public.reprice_future_sessions(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprice_future_sessions(uuid, boolean) TO authenticated;
