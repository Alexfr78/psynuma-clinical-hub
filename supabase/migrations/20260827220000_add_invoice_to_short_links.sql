-- Allow 'invoice' as a target type for public short links, used by
-- send-invoice-notification to send a short /enlace/:code link instead of
-- the long /factura/:access_token URL.
ALTER TABLE public.public_short_links DROP CONSTRAINT public_short_links_target_type_check;
ALTER TABLE public.public_short_links
  ADD CONSTRAINT public_short_links_target_type_check
  CHECK (target_type IN ('session', 'session_payment', 'debt', 'debt_bono', 'invoice'));
