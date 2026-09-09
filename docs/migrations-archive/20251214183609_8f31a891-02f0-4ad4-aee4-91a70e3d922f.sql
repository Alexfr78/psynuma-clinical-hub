-- Drop existing insert policy
DROP POLICY IF EXISTS "Insert signature by token" ON public.consent_signatures;

-- Create new insert policy that allows inserting signatures for consents with valid access_token
-- The check verifies the consent exists and has a valid access_token
CREATE POLICY "Insert signature by token" 
ON public.consent_signatures 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.consents 
    WHERE consents.id = consent_id 
    AND consents.access_token IS NOT NULL
    AND consents.status = 'pending'
  )
);