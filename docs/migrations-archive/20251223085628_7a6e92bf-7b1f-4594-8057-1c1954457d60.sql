-- Add custom_domain column to centers table
ALTER TABLE centers 
ADD COLUMN IF NOT EXISTS custom_domain TEXT;

COMMENT ON COLUMN centers.custom_domain IS 'Dominio personalizado del centro (ej: psycma.es) para enlaces en notificaciones';