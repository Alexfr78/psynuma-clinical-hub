-- Add is_public column to center_locations
ALTER TABLE center_locations 
ADD COLUMN is_public BOOLEAN DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN center_locations.is_public IS 'Si es true, la ubicación es visible en el portal de pacientes para reservas';

-- Create policy for public read of public locations in portal
CREATE POLICY "Public read public locations for portal"
ON center_locations FOR SELECT
USING (
  is_public = true 
  AND center_id IN (
    SELECT id FROM centers WHERE portal_enabled = true
  )
);