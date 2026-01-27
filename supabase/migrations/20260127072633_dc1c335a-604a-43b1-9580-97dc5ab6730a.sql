-- Add column to store verification checkbox responses
ALTER TABLE public.consents 
ADD COLUMN verification_responses jsonb DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.consents.verification_responses IS 'JSON object storing user responses to verification checkboxes. Format: { "0": true/false, "1": true/false, ... }';