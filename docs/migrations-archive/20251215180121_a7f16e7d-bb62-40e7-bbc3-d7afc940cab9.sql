-- Add invoice automation settings to centers table
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS invoice_on_payment_mode text DEFAULT 'disabled',
ADD COLUMN IF NOT EXISTS invoice_send_channel text DEFAULT 'email';

-- Add comment for documentation
COMMENT ON COLUMN public.centers.invoice_on_payment_mode IS 'Mode for invoice generation on payment: ask, auto, disabled';
COMMENT ON COLUMN public.centers.invoice_send_channel IS 'Default channel for sending invoices: email, whatsapp, both';