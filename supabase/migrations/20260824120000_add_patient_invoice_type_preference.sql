-- Store the invoice document type preference used by automatic invoicing.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS preferred_invoice_type text NOT NULL DEFAULT 'simplified';

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_preferred_invoice_type_check;

ALTER TABLE public.patients
  ADD CONSTRAINT patients_preferred_invoice_type_check
  CHECK (preferred_invoice_type IN ('simplified', 'complete'));

COMMENT ON COLUMN public.patients.preferred_invoice_type IS
  'Preferred ordinary invoice document type for automatic invoicing.';
