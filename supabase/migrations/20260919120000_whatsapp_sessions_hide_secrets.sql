-- Keep Wasender credentials available only to service-role edge functions.
-- The invoker view preserves the existing RLS center/role policy for client reads.
CREATE OR REPLACE VIEW public.whatsapp_sessions_safe
WITH (security_invoker = true)
AS
SELECT
  id,
  center_id,
  professional_id,
  wasender_session_id,
  name,
  status,
  phone_number,
  qr_code,
  qr_expires_at,
  last_connected_at,
  last_error,
  is_active,
  created_at,
  updated_at
FROM public.whatsapp_sessions;

REVOKE SELECT ON TABLE public.whatsapp_sessions FROM anon, authenticated;
GRANT SELECT (
  id,
  center_id,
  professional_id,
  wasender_session_id,
  name,
  status,
  phone_number,
  qr_code,
  qr_expires_at,
  last_connected_at,
  last_error,
  is_active,
  created_at,
  updated_at
) ON TABLE public.whatsapp_sessions TO authenticated;

GRANT SELECT ON TABLE public.whatsapp_sessions_safe TO authenticated, service_role;
