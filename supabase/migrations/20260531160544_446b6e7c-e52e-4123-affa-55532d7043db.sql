CREATE OR REPLACE FUNCTION public.protect_session_anon_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.center_id IS DISTINCT FROM OLD.center_id
       OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.session_type_id IS DISTINCT FROM OLD.session_type_id
       OR NEW.price IS DISTINCT FROM OLD.price
       OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
       OR NEW.bono_id IS DISTINCT FROM OLD.bono_id
       OR NEW.access_token IS DISTINCT FROM OLD.access_token
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Anonymous updates cannot modify protected fields on sessions';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;