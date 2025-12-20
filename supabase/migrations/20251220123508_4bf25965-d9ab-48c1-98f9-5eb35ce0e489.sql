-- Allow patients with a valid session access token (x-session-token) to read ONLY the specific location linked to their session
ALTER TABLE public.center_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public session can view its location" ON public.center_locations;
CREATE POLICY "Public session can view its location"
ON public.center_locations
FOR SELECT
USING (public.verify_session_token_for_location(id));

-- Expose a safe, minimal center address payload for a public session link
-- (We do NOT grant direct SELECT on centers because it contains sensitive fields.)
CREATE OR REPLACE FUNCTION public.get_center_address_for_session_token()
RETURNS TABLE(center_name text, center_address text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    c.name AS center_name,
    NULLIF(
      trim(both ', ' from concat_ws(
        ', ',
        NULLIF(trim(concat_ws(' ', c.address, c.address_details)), ''),
        NULLIF(trim(c.city), ''),
        NULLIF(trim(c.postal_code), '')
      )),
      ''
    ) AS center_address
  FROM public.sessions s
  JOIN public.centers c ON c.id = s.center_id
  WHERE s.access_token = public.get_session_token()
  LIMIT 1;
$$;