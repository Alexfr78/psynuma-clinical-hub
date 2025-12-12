-- Add separate field for NombreSistemaInformatico (max 30 chars, product name)
-- verifactu_software_name will be used for NombreRazon (fiscal/legal name of developer)
ALTER TABLE public.centers 
ADD COLUMN verifactu_sistema_informatico text DEFAULT 'PSYCMA';

-- Add comment for clarity
COMMENT ON COLUMN public.centers.verifactu_software_name IS 'NombreRazon: Nombre fiscal del desarrollador del software (debe coincidir con censo AEAT)';
COMMENT ON COLUMN public.centers.verifactu_sistema_informatico IS 'NombreSistemaInformatico: Nombre comercial del producto software (máximo 30 caracteres)';