CREATE OR REPLACE FUNCTION public.enforce_single_default_per_day()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_center_id uuid;
BEGIN
  IF NEW.is_default IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_default IS NOT DISTINCT FROM NEW.is_default THEN
    RETURN NEW;
  END IF;

  SELECT center_id INTO v_center_id
  FROM public.center_locations WHERE id = NEW.location_id;

  IF v_center_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.location_schedules ls
  SET is_default = false
  FROM public.center_locations cl
  WHERE ls.location_id = cl.id
    AND cl.center_id = v_center_id
    AND ls.day_of_week = NEW.day_of_week
    AND ls.id IS DISTINCT FROM NEW.id
    AND ls.is_default = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_default_per_day ON public.location_schedules;
CREATE TRIGGER trg_enforce_single_default_per_day
BEFORE INSERT OR UPDATE ON public.location_schedules
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_default_per_day();