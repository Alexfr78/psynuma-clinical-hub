-- 1. Añadir columna display_order solo si no existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'session_types' 
    AND column_name = 'display_order'
  ) THEN
    ALTER TABLE session_types ADD COLUMN display_order integer DEFAULT 0;
  END IF;
END $$;

-- 2. Inicializar display_order por centro según orden alfabético
-- Solo para filas donde display_order sea NULL o 0
WITH ordered_types AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY center_id ORDER BY name) as rn
  FROM session_types
  WHERE display_order IS NULL OR display_order = 0
)
UPDATE session_types st
SET display_order = ot.rn
FROM ordered_types ot
WHERE st.id = ot.id;

-- 3. Crear índice compuesto para optimizar consultas ordenadas
CREATE INDEX IF NOT EXISTS idx_session_types_order 
ON session_types(center_id, display_order, name);

-- 4. RPC Segura para reordenar tipos de sesión
CREATE OR REPLACE FUNCTION public.reorder_session_types(
  p_center_id uuid,
  p_ordered_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_invalid_count integer;
BEGIN
  -- Verificar que el usuario tiene acceso al centro
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL OR v_user_center_id != p_center_id THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este centro';
  END IF;
  
  -- Verificar que el usuario es admin o profesional
  IF NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para reordenar tipos de sesión';
  END IF;
  
  -- Verificar que TODOS los IDs pertenecen al centro especificado
  SELECT COUNT(*) INTO v_invalid_count
  FROM unnest(p_ordered_ids) AS provided_id
  WHERE NOT EXISTS (
    SELECT 1 FROM session_types 
    WHERE id = provided_id AND center_id = p_center_id
  );
  
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Algunos IDs no pertenecen al centro especificado';
  END IF;
  
  -- Actualización en bloque usando unnest con ORDINALITY
  UPDATE session_types st
  SET display_order = o.ord::integer,
      updated_at = now()
  FROM (
    SELECT id, ord
    FROM unnest(p_ordered_ids) WITH ORDINALITY AS t(id, ord)
  ) o
  WHERE st.id = o.id
    AND st.center_id = p_center_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'updated_count', array_length(p_ordered_ids, 1)
  );
END;
$$;

-- 5. RPC Atómica para crear session_type con display_order automático
CREATE OR REPLACE FUNCTION public.create_session_type_with_order(
  p_center_id uuid,
  p_name text,
  p_default_price numeric,
  p_duration_minutes integer,
  p_color text,
  p_commission_rate numeric DEFAULT NULL,
  p_tax_treatment text DEFAULT NULL,
  p_vat_rate numeric DEFAULT NULL,
  p_exemption_code text DEFAULT NULL,
  p_non_subject_code text DEFAULT NULL,
  p_vat_regime_key text DEFAULT NULL,
  p_is_public boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_center_id uuid;
  v_new_order integer;
  v_new_id uuid;
BEGIN
  -- Verificar permisos
  v_user_center_id := get_user_center_id(auth.uid());
  
  IF v_user_center_id IS NULL OR v_user_center_id != p_center_id THEN
    RAISE EXCEPTION 'No tienes permiso para este centro';
  END IF;
  
  IF NOT (is_admin(auth.uid()) OR is_professional(auth.uid())) THEN
    RAISE EXCEPTION 'No tienes permiso para crear tipos de sesión';
  END IF;
  
  -- Bloquear la tabla para este centro y obtener max + 1 atómicamente
  SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_new_order
  FROM session_types
  WHERE center_id = p_center_id
  FOR UPDATE;
  
  -- Insertar con el orden calculado
  INSERT INTO session_types (
    center_id, name, default_price, duration_minutes, color,
    commission_rate, tax_treatment, vat_rate, exemption_code,
    non_subject_code, vat_regime_key, is_public, display_order
  ) VALUES (
    p_center_id, p_name, p_default_price, p_duration_minutes, p_color,
    p_commission_rate, p_tax_treatment, p_vat_rate, p_exemption_code,
    p_non_subject_code, p_vat_regime_key, p_is_public, v_new_order
  )
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;