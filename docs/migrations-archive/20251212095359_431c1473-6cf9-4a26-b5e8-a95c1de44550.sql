-- Add fiscal configuration fields to session_types table
ALTER TABLE public.session_types
ADD COLUMN IF NOT EXISTS tax_treatment TEXT DEFAULT 'EXENTA',
ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS exemption_code TEXT DEFAULT 'E1',
ADD COLUMN IF NOT EXISTS non_subject_code TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vat_regime_key TEXT DEFAULT '01';

-- Add comment explaining the fields
COMMENT ON COLUMN public.session_types.tax_treatment IS 'Fiscal treatment: S1 (sujeta), S2 (inversión), EXENTA, NO_SUJETA';
COMMENT ON COLUMN public.session_types.vat_rate IS 'VAT rate: 0, 4, 10, or 21';
COMMENT ON COLUMN public.session_types.exemption_code IS 'Exemption code E1-E6 (only for EXENTA treatment)';
COMMENT ON COLUMN public.session_types.non_subject_code IS 'Non-subject code N1-N2 (only for NO_SUJETA treatment)';
COMMENT ON COLUMN public.session_types.vat_regime_key IS 'VAT regime key, default 01';