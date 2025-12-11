-- Add rectification reason code (R1-R5) and rectification amounts for Verifactu compliance
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS rectification_reason_code TEXT,
ADD COLUMN IF NOT EXISTS base_rectificada NUMERIC,
ADD COLUMN IF NOT EXISTS cuota_rectificada NUMERIC,
ADD COLUMN IF NOT EXISTS cuota_recargo_rectificado NUMERIC;

-- Add comment to explain the rectification_reason_code values
COMMENT ON COLUMN public.invoices.rectification_reason_code IS 'Verifactu rectification reason: R1 (error fundado en derecho), R2 (concurso acreedores), R3 (crédito incobrable), R4 (resto causas), R5 (rectificativa simplificada)';
COMMENT ON COLUMN public.invoices.base_rectificada IS 'For substitution (S) rectifying invoices: original base amount being rectified';
COMMENT ON COLUMN public.invoices.cuota_rectificada IS 'For substitution (S) rectifying invoices: original tax amount being rectified';
COMMENT ON COLUMN public.invoices.cuota_recargo_rectificado IS 'For substitution (S) rectifying invoices: original surcharge amount being rectified (if applicable)';