-- Allow public read access to consent templates that are linked to consents with access_token
-- This enables patients to view verification checkboxes in the public signature portal
CREATE POLICY "Public read template via consent token" 
ON public.consent_templates 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.consents 
    WHERE consents.template_id = consent_templates.id 
    AND consents.access_token IS NOT NULL
  )
);