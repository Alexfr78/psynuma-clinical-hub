-- Las páginas públicas (/cita/:token, /pagar/:token) ofrecen compartir un bono
-- con la pareja vinculada. Antes recibían el nombre de pila de la pareja, que es
-- un dato de otro paciente expuesto a quien tenga el enlace. Ahora solo se sabe
-- si hay pareja vinculada; el texto es genérico ("Compartir el bono en pareja").

CREATE OR REPLACE FUNCTION public.public_has_couple_partner(
  p_session_token text DEFAULT NULL,
  p_debt_token text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  IF p_session_token IS NOT NULL THEN
    SELECT patient_id INTO v_patient_id FROM public.sessions WHERE access_token = p_session_token;
  ELSIF p_debt_token IS NOT NULL THEN
    SELECT patient_id INTO v_patient_id FROM public.debts WHERE access_token = p_debt_token;
  END IF;
  IF v_patient_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.patient_relationships r
     WHERE r.relationship_type = 'couple'
       AND v_patient_id IN (r.patient_a_id, r.patient_b_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.public_has_couple_partner(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_has_couple_partner(text, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_public_couple_partner_first_name(text, text);
