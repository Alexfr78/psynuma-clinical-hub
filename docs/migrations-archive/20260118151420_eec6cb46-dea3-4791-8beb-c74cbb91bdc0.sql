-- Fix overly permissive patient access policy
-- The "Public read patient via invoice token" policy allows reading ANY patient 
-- that has an invoice with access_token set, without requiring the actual token

-- Drop the problematic policy
DROP POLICY IF EXISTS "Public read patient via invoice token" ON public.patients;

-- The correct token-based access is already handled by these existing policies:
-- - "Anon read patient by valid invoice token" - requires actual token match via get_invoice_token()
-- - "Anon read patient by valid consent token" - requires actual token match
-- - "Anon read patient by valid session token" - requires actual token match

-- Verify the correct policies exist (they should already be there)
-- No need to recreate them as they are already secure