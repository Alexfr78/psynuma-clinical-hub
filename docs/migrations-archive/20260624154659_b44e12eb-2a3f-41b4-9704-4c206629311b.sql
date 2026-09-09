CREATE POLICY "Professionals can select own oauth connections"
ON public.oauth_connections
FOR SELECT
TO authenticated
USING (professional_id = auth.uid());

REVOKE SELECT (access_token, refresh_token, sync_token)
ON public.oauth_connections FROM authenticated, anon;