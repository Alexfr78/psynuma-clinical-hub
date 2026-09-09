CREATE OR REPLACE FUNCTION public.find_portal_patient_by_identifier(p_center_id uuid, p_identifier text, p_channel text)
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id, p.first_name, p.last_name, p.email, p.phone
  FROM public.patients p
  WHERE p.center_id = p_center_id
    AND coalesce(p.status::text, 'active') <> 'archived'
    AND (
      (p_channel = 'email' AND lower(trim(coalesce(p.email, ''))) = lower(trim(p_identifier)))
      OR
      (p_channel = 'whatsapp' AND public.normalize_portal_phone(p.phone) = public.normalize_portal_phone(p_identifier))
    )
  ORDER BY
    (coalesce(p.status::text,'active') = 'active') DESC,
    (SELECT max(s.created_at) FROM public.sessions s WHERE s.patient_id = p.id) DESC NULLS LAST,
    p.created_at DESC
  LIMIT 2;
$function$;