-- Actualizar función para establecer search_path
CREATE OR REPLACE FUNCTION public.generate_session_access_token()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.access_token IS NULL THEN
    NEW.access_token := encode(gen_random_bytes(16), 'hex');
  END IF;
  RETURN NEW;
END;
$$;