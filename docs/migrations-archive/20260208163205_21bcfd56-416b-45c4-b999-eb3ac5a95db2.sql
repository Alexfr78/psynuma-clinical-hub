-- Add message_type column to whatsapp_messages table
ALTER TABLE public.whatsapp_messages 
ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'manual';

-- Add index for better query performance on message_type
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_message_type 
ON public.whatsapp_messages(message_type);