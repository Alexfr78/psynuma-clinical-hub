
DROP POLICY IF EXISTS "Service role full access messages" ON public.whatsapp_messages;
CREATE POLICY "Service role full access messages"
ON public.whatsapp_messages
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access sessions" ON public.whatsapp_sessions;
CREATE POLICY "Service role full access sessions"
ON public.whatsapp_sessions
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access queue" ON public.whatsapp_queue;
CREATE POLICY "Service role full access queue"
ON public.whatsapp_queue
AS PERMISSIVE
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
