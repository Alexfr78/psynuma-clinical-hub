-- Add separate payment option text columns to communication_templates
ALTER TABLE communication_templates 
ADD COLUMN IF NOT EXISTS payment_option_stripe TEXT,
ADD COLUMN IF NOT EXISTS payment_option_bizum TEXT,
ADD COLUMN IF NOT EXISTS payment_option_bono TEXT;