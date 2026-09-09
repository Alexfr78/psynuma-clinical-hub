-- Fix whatsapp_messages.session_id foreign key (it must reference therapy sessions, not whatsapp_sessions)
ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_session_id_fkey;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.sessions(id)
  ON DELETE SET NULL;