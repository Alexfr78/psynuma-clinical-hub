ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS verifactu_error_permanent boolean DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS verifactu_error_message text;