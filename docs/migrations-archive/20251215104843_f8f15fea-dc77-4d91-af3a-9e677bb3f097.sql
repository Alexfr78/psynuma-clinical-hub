-- Add sync days configuration to professional_integrations
ALTER TABLE professional_integrations 
ADD COLUMN IF NOT EXISTS google_sync_days_past integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS google_sync_days_future integer DEFAULT 90;

-- Add comment for documentation
COMMENT ON COLUMN professional_integrations.google_sync_days_past IS 'Number of past days to sync with Google Calendar';
COMMENT ON COLUMN professional_integrations.google_sync_days_future IS 'Number of future days to sync with Google Calendar';