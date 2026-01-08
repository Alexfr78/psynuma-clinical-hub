
-- Create table to track Verifactu chain status per installation
CREATE TABLE public.verifactu_chain_status (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  nif_emisor TEXT NOT NULL,
  id_sistema_informatico TEXT NOT NULL,
  numero_instalacion INTEGER NOT NULL,
  ultimo_hash TEXT NOT NULL,
  ultima_factura_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Unique constraint per chain identity
  CONSTRAINT verifactu_chain_unique UNIQUE (center_id, nif_emisor, id_sistema_informatico, numero_instalacion)
);

-- Enable RLS
ALTER TABLE public.verifactu_chain_status ENABLE ROW LEVEL SECURITY;

-- Policy: centers can manage their own chain status
CREATE POLICY "Centers can manage their chain status"
ON public.verifactu_chain_status
FOR ALL
USING (
  center_id IN (
    SELECT p.center_id FROM profiles p WHERE p.id = auth.uid()
  )
);

-- Index for fast lookups
CREATE INDEX idx_verifactu_chain_lookup 
ON public.verifactu_chain_status(center_id, nif_emisor, id_sistema_informatico, numero_instalacion);

-- Trigger for updated_at
CREATE TRIGGER update_verifactu_chain_status_updated_at
BEFORE UPDATE ON public.verifactu_chain_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
