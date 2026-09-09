-- Add WhatsApp configuration fields to centers table
ALTER TABLE public.centers 
ADD COLUMN IF NOT EXISTS whatsapp_send_method TEXT DEFAULT 'web',
ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT;

-- Add constraint for valid send methods
ALTER TABLE public.centers 
ADD CONSTRAINT centers_whatsapp_send_method_check 
CHECK (whatsapp_send_method IN ('web', 'api'));