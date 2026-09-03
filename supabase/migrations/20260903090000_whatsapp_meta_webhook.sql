-- =====================================================================
-- Soporte para el webhook receptor de Meta Cloud API (WhatsApp oficial).
-- Hasta ahora el message_id que Meta devuelve al aceptar un envío
-- (`messages[0].id`, formato "wamid.XXXX") se descartaba, así que era
-- imposible correlacionar después los eventos asíncronos de estado
-- (`sent`/`delivered`/`read`/`failed`) que Meta manda vía webhook.
--
-- Se añade `meta_message_id` en dos tablas porque los tres edge functions
-- que envían por Meta API no siempre escriben en el mismo sitio:
--   - send-session-reminders y send-invoice-notification (ruta WasenderAPI)
--     insertan una fila de seguimiento en whatsapp_messages, igual que ya
--     hace wasender_message_id.
--   - send-notification (ruta Meta) y send-invoice-notification (ruta
--     Meta) sólo actualizan/insertan en notifications.
-- Ambas columnas permiten al webhook localizar la fila correspondiente
-- sin importar por qué camino se guardó el envío.
-- =====================================================================

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
