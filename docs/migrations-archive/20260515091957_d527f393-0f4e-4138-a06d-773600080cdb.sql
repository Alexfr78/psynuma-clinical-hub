CREATE OR REPLACE FUNCTION public.apply_resolved_price_to_session()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb;
BEGIN
  IF NEW.session_type_id IS NULL OR NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.pricing_source,'') NOT IN ('custom','tariff_plan') THEN
    SELECT resolve_effective_price(
      NEW.patient_id, 'session_type', NEW.session_type_id, NEW.session_date::date
    ) INTO r;
    IF r IS NOT NULL THEN
      NEW.base_price_snapshot := COALESCE(NEW.base_price_snapshot, NULLIF(r->>'base_price','')::numeric);
      NEW.pricing_source      := COALESCE(NULLIF(r->>'pricing_source',''), 'base');
      IF (r->>'pricing_source') IN ('custom','tariff_plan') THEN
        NEW.price                              := (r->>'applied_price')::numeric;
        NEW.custom_price_id                    := NULLIF(r->>'custom_price_id','')::uuid;
        NEW.tariff_plan_id_snapshot            := NULLIF(r->>'tariff_plan_id','')::uuid;
        NEW.tariff_plan_assignment_id_snapshot := NULLIF(r->>'tariff_plan_assignment_id','')::uuid;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_resolved_price ON public.sessions;
CREATE TRIGGER trg_apply_resolved_price
BEFORE INSERT ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.apply_resolved_price_to_session();