ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS meta_message_id text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_meta_message_id
  ON public.whatsapp_messages (meta_message_id)
  WHERE meta_message_id IS NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS meta_message_id text;

CREATE INDEX IF NOT EXISTS idx_notifications_meta_message_id
  ON public.notifications (meta_message_id)
  WHERE meta_message_id IS NOT NULL;