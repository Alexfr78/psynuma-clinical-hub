-- Add last_google_sync_at field to professional_integrations
ALTER TABLE public.professional_integrations 
ADD COLUMN IF NOT EXISTS last_google_sync_at TIMESTAMP WITH TIME ZONE;