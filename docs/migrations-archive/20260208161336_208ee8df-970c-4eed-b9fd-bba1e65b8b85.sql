-- Add unique constraint on center_id for whatsapp_sessions table
-- This is needed for the upsert operation in wasender-connect

ALTER TABLE public.whatsapp_sessions 
ADD CONSTRAINT whatsapp_sessions_center_id_key UNIQUE (center_id);