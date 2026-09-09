-- Añadir campos de configuración Verifactu al centro
ALTER TABLE public.centers 
ADD COLUMN IF NOT EXISTS verifactu_certificate_base64 TEXT,
ADD COLUMN IF NOT EXISTS verifactu_certificate_password TEXT,
ADD COLUMN IF NOT EXISTS verifactu_environment TEXT DEFAULT 'test',
ADD COLUMN IF NOT EXISTS verifactu_software_name TEXT DEFAULT 'Psynuma',
ADD COLUMN IF NOT EXISTS verifactu_software_version TEXT DEFAULT '1.0.0',
ADD COLUMN IF NOT EXISTS verifactu_software_nif TEXT;

-- Añadir campos de Verifactu a facturas para encadenamiento y QR
ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS invoice_hash TEXT,
ADD COLUMN IF NOT EXISTS previous_invoice_hash TEXT,
ADD COLUMN IF NOT EXISTS verifactu_qr TEXT,
ADD COLUMN IF NOT EXISTS verifactu_registration_id TEXT;

-- Crear índice para búsqueda eficiente de factura anterior
CREATE INDEX IF NOT EXISTS idx_invoices_center_issue_date ON public.invoices(center_id, issue_date DESC, created_at DESC);