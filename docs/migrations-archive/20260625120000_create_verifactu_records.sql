-- Canonical Verifactu records for altas and anulaciones.
-- This table stores the exact fiscal record evidence instead of reconstructing it from invoices later.
CREATE TABLE public.verifactu_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  previous_record_id UUID REFERENCES public.verifactu_records(id) ON DELETE SET NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('alta', 'anulacion')),
  taxpayer_nif TEXT NOT NULL,
  system_id TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('test', 'production')),
  invoice_number TEXT NOT NULL,
  invoice_issue_date DATE NOT NULL,
  hash TEXT NOT NULL,
  previous_hash TEXT,
  xml_sent TEXT NOT NULL,
  aeat_response_xml TEXT,
  aeat_status TEXT NOT NULL CHECK (aeat_status IN ('accepted', 'rejected', 'pending', 'error')),
  aeat_csv TEXT,
  http_status INTEGER,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_verifactu_records_center_chain
ON public.verifactu_records(center_id, taxpayer_nif, system_id, installation_id, created_at);

CREATE INDEX idx_verifactu_records_invoice
ON public.verifactu_records(invoice_id);

CREATE INDEX idx_verifactu_records_previous
ON public.verifactu_records(previous_record_id);

CREATE UNIQUE INDEX idx_verifactu_records_hash_unique
ON public.verifactu_records(center_id, taxpayer_nif, system_id, installation_id, hash);

ALTER TABLE public.verifactu_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view their center verifactu records"
ON public.verifactu_records FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  AND center_id = get_user_center_id(auth.uid())
);

CREATE TRIGGER update_verifactu_records_updated_at
BEFORE UPDATE ON public.verifactu_records
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.verifactu_chain_status
ADD COLUMN IF NOT EXISTS ultima_verifactu_record_id UUID REFERENCES public.verifactu_records(id) ON DELETE SET NULL;
