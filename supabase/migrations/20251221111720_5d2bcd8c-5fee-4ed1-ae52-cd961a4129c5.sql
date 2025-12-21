-- Create function to verify session token for center access
CREATE OR REPLACE FUNCTION public.verify_session_token_for_center(center_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sessions
    WHERE access_token = public.get_session_token()
    AND center_id = center_uuid
    AND access_token IS NOT NULL
  )
$$;

-- Add RLS policy for centers to allow public read via session token
CREATE POLICY "Public read center via validated session token"
ON public.centers
FOR SELECT
USING (public.verify_session_token_for_center(id));