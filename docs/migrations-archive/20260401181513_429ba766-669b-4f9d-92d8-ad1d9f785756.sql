DROP POLICY IF EXISTS "Anon can read link by token" ON public.autoregistro_links;

CREATE POLICY "Anon can read link by token"
ON public.autoregistro_links FOR SELECT
TO anon
USING (
  access_token = public.get_autoregistro_token()
  AND status = 'active'
  AND (expires_at IS NULL OR expires_at > now())
);

DROP POLICY IF EXISTS "Anon can insert entries via token" ON public.autoregistro_entries;

CREATE POLICY "Anon can insert entries via token"
ON public.autoregistro_entries FOR INSERT
TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.autoregistro_links
    WHERE id = link_id
    AND access_token = public.get_autoregistro_token()
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > now())
  )
);