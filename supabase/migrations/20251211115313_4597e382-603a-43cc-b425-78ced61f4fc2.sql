-- Update the trigger function to use explicit schema reference for gen_random_bytes
CREATE OR REPLACE FUNCTION public.generate_session_access_token()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.access_token IS NULL THEN
    -- Use explicit schema reference to extensions.gen_random_bytes
    NEW.access_token := encode(extensions.gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$function$;