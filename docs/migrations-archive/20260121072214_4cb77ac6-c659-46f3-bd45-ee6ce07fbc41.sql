-- Fix oauth_connections RLS to allow SELECT for own records (needed for UPSERT in callbacks)
-- This fixes the issue where OAuth reconnections fail because UPDATE operations need SELECT first

DROP POLICY IF EXISTS "Block direct SELECT on oauth_connections" ON oauth_connections;

CREATE POLICY "Professionals can select own oauth connections"
  ON oauth_connections
  FOR SELECT
  USING (
    (professional_id = auth.uid()) OR is_admin(auth.uid())
  );

-- Note: Frontend code should continue using oauth_connections_safe view for security
-- The direct SELECT is only allowed for authenticated users on their own records
-- Edge functions can use oauth_connections directly since they run with service role