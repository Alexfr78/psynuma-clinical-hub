-- Update default sync days past to 30 for professionals with 0
UPDATE professional_integrations 
SET google_sync_days_past = 30 
WHERE google_sync_days_past = 0;

-- Clear sync_token to force full resync after reconnection
UPDATE oauth_connections 
SET sync_token = NULL 
WHERE provider = 'google';