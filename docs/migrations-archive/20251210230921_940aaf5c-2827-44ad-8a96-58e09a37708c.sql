-- Add tax and retention columns to invoice_items
ALTER TABLE invoice_items 
ADD COLUMN IF NOT EXISTS tax_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_name text DEFAULT 'IVA',
ADD COLUMN IF NOT EXISTS tax_amount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS retention_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS retention_name text DEFAULT 'IRPF',
ADD COLUMN IF NOT EXISTS retention_amount numeric DEFAULT 0;

-- Add retention columns to invoices table
ALTER TABLE invoices 
ADD COLUMN IF NOT EXISTS retention_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS retention_amount numeric DEFAULT 0;