ALTER TABLE public.centers ADD COLUMN IF NOT EXISTS bank_transfer_info text;
ALTER TABLE public.communication_templates ADD COLUMN IF NOT EXISTS payment_option_transfer text;