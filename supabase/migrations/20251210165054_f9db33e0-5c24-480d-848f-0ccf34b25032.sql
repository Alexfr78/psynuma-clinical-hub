-- Add new billing fields to centers table
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS country text DEFAULT 'España',
ADD COLUMN IF NOT EXISTS province text,
ADD COLUMN IF NOT EXISTS address_details text,
ADD COLUMN IF NOT EXISTS default_tax_name text DEFAULT 'IVA',
ADD COLUMN IF NOT EXISTS default_tax_rate numeric DEFAULT 21,
ADD COLUMN IF NOT EXISTS include_tax_in_price boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS retention_name text DEFAULT 'IRPF',
ADD COLUMN IF NOT EXISTS retention_rate numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS invoice_footer text,
ADD COLUMN IF NOT EXISTS invoice_logo_url text,
ADD COLUMN IF NOT EXISTS auto_invoicing_enabled boolean DEFAULT false;

-- Create invoice_series table
CREATE TABLE public.invoice_series (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  format text NOT NULL DEFAULT '{SERIE}-{AAAA}-{NNNNN}',
  series_type text NOT NULL DEFAULT 'ordinary' CHECK (series_type IN ('ordinary', 'rectifying')),
  invoice_type text NOT NULL DEFAULT 'complete' CHECK (invoice_type IN ('simplified', 'complete')),
  next_number integer NOT NULL DEFAULT 1,
  is_default boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on invoice_series
ALTER TABLE public.invoice_series ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for invoice_series
CREATE POLICY "View invoice series in center"
ON public.invoice_series
FOR SELECT
USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage invoice series in center"
ON public.invoice_series
FOR ALL
USING (center_id = get_user_center_id(auth.uid()) AND (is_admin(auth.uid()) OR is_professional(auth.uid())));

-- Create trigger for updated_at
CREATE TRIGGER update_invoice_series_updated_at
BEFORE UPDATE ON public.invoice_series
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create unique constraint for default series per type per center
CREATE UNIQUE INDEX idx_invoice_series_default_per_type 
ON public.invoice_series (center_id, series_type) 
WHERE is_default = true AND is_archived = false;

-- Create storage bucket for invoice logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-logos', 'invoice-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for invoice logos
CREATE POLICY "Anyone can view invoice logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-logos');

CREATE POLICY "Authenticated users can upload invoice logos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their center logos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'invoice-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their center logos"
ON storage.objects FOR DELETE
USING (bucket_id = 'invoice-logos' AND auth.role() = 'authenticated');