-- Drop ALL existing policies on consent_signatures
DROP POLICY IF EXISTS "Insert signature by token" ON public.consent_signatures;
DROP POLICY IF EXISTS "View signatures in center" ON public.consent_signatures;

-- Recreate policies as PERMISSIVE (default) for proper unauthenticated access

-- Allow public insert when consent has valid token and is pending
CREATE POLICY "Insert signature by token" 
ON public.consent_signatures 
FOR INSERT 
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.consents 
    WHERE consents.id = consent_signatures.consent_id 
    AND consents.access_token IS NOT NULL
    AND consents.status = 'pending'::consent_status
  )
);

-- Allow read for public with valid token
CREATE POLICY "Read signatures by token"
ON public.consent_signatures
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.consents 
    WHERE consents.id = consent_signatures.consent_id 
    AND consents.access_token IS NOT NULL
  )
);

-- Allow professionals/admins in center to view all signatures
CREATE POLICY "View signatures in center" 
ON public.consent_signatures 
FOR SELECT 
TO authenticated
USING (
  consent_id IN (
    SELECT consents.id FROM consents 
    WHERE consents.center_id = get_user_center_id(auth.uid())
  )
);