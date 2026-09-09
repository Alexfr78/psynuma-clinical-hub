-- 1. Reset needs_reconnect to false for clean reconnection attempt
UPDATE oauth_connections 
SET needs_reconnect = false, 
    last_sync_status = NULL,
    sync_token = NULL
WHERE provider = 'google' 
  AND needs_reconnect = true;

-- 2. Set google_sync_days_past to 30 days where it's 0 or NULL
UPDATE professional_integrations 
SET google_sync_days_past = 30 
WHERE google_sync_days_past = 0 OR google_sync_days_past IS NULL;

-- 3. Set default value for google_sync_days_past column
ALTER TABLE professional_integrations 
ALTER COLUMN google_sync_days_past SET DEFAULT 30;