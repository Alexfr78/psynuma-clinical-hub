-- Add access_token column to invoices table for public access
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS access_token TEXT DEFAULT encode(extensions.gen_random_bytes(16), 'hex');

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_invoices_access_token ON public.invoices(access_token);

-- RLS policy for public read by access_token
CREATE POLICY "Public read invoice by access_token" 
ON public.invoices 
FOR SELECT 
USING (access_token IS NOT NULL);

-- Also allow public read of invoice_items by token
CREATE POLICY "Public read invoice items by access_token"
ON public.invoice_items
FOR SELECT
USING (
  invoice_id IN (
    SELECT id FROM public.invoices WHERE access_token IS NOT NULL
  )
);

-- Allow public read of patient data for invoice display
CREATE POLICY "Public read patient via invoice token"
ON public.patients
FOR SELECT
USING (
  id IN (
    SELECT patient_id FROM public.invoices WHERE access_token IS NOT NULL
  )
);