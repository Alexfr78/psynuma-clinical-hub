-- Add verification_checkboxes column to consent_templates
-- This stores an array of custom checkbox labels that patients must check when signing
ALTER TABLE public.consent_templates
ADD COLUMN verification_checkboxes jsonb DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.consent_templates.verification_checkboxes IS 'Array of custom checkbox labels that patients must check when signing the consent';