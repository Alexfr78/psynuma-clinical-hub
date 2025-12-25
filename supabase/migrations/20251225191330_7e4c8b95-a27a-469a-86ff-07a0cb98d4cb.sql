-- Crear ENUM para tipo de ubicación
CREATE TYPE location_type_enum AS ENUM ('in_person', 'online');

-- Añadir columna location_type a center_locations
ALTER TABLE center_locations 
ADD COLUMN location_type location_type_enum DEFAULT 'in_person';

-- Hacer street y city nullable para ubicaciones ONLINE
ALTER TABLE center_locations 
ALTER COLUMN street DROP NOT NULL,
ALTER COLUMN city DROP NOT NULL;

-- Función para validar una sola ubicación ONLINE activa por centro
CREATE OR REPLACE FUNCTION check_single_online_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location_type = 'online' AND NEW.is_active = true THEN
    IF EXISTS (
      SELECT 1 FROM center_locations 
      WHERE center_id = NEW.center_id 
      AND location_type = 'online' 
      AND is_active = true
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) THEN
      RAISE EXCEPTION 'Solo puede existir una ubicación ONLINE activa por centro';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER enforce_single_online_location
BEFORE INSERT OR UPDATE ON center_locations
FOR EACH ROW EXECUTE FUNCTION check_single_online_location();

-- RPC para listar ubicaciones públicas del portal
CREATE OR REPLACE FUNCTION portal_list_locations(p_center_slug text, p_location_type location_type_enum DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  name text,
  location_type location_type_enum,
  street text,
  city text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    cl.id,
    cl.name,
    cl.location_type,
    cl.street,
    cl.city
  FROM center_locations cl
  JOIN centers c ON c.id = cl.center_id
  WHERE c.portal_slug = p_center_slug
    AND c.portal_enabled = true
    AND cl.is_public = true
    AND cl.is_active = true
    AND (p_location_type IS NULL OR cl.location_type = p_location_type);
$$;