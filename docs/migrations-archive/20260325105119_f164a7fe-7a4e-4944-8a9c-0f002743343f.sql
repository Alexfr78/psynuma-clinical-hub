
-- Add columns to consents table
ALTER TABLE public.consents 
ADD COLUMN IF NOT EXISTS uploaded_file_url text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'digital';

-- Create storage bucket for consent documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('consent-documents', 'consent-documents', false)
ON CONFLICT DO NOTHING;

-- RLS policies for consent-documents bucket
CREATE POLICY "Authenticated users can upload consent documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'consent-documents');

CREATE POLICY "Authenticated users can read consent documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'consent-documents');
