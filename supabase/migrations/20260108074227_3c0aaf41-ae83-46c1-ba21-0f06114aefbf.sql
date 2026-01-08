-- Add verifactu_numero_instalacion column to centers table
ALTER TABLE public.centers 
ADD COLUMN IF NOT EXISTS verifactu_numero_instalacion integer DEFAULT 1;

-- Update to 2 for the current center to start a new chain
UPDATE public.centers 
SET verifactu_numero_instalacion = 2 
WHERE verifactu_software_nif IS NOT NULL;