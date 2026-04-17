-- ============================================================
-- Sistema de tarifas personalizadas por paciente
-- ============================================================

-- 1. Tabla principal de tarifas personalizadas
-- ============================================================
CREATE TABLE patient_custom_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('session_type', 'bono_template')),
  target_id UUID NOT NULL,
  custom_price NUMERIC(10,2) NOT NULL CHECK (custom_price >= 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pcp_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Índices para búsqueda eficiente
CREATE INDEX idx_pcp_patient_id ON patient_custom_prices(patient_id);
CREATE INDEX idx_pcp_center_id ON patient_custom_prices(center_id);
CREATE INDEX idx_pcp_target ON patient_custom_prices(target_type, target_id);
CREATE INDEX idx_pcp_active ON patient_custom_prices(patient_id, target_type, target_id, is_active);

-- Función para validar solapamientos ANTES de insert/update
CREATE OR REPLACE FUNCTION check_custom_price_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_overlap_count INTEGER;
BEGIN
  -- Solo validar tarifas activas
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM patient_custom_prices
  WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND patient_id = NEW.patient_id
    AND target_type = NEW.target_type
    AND target_id = NEW.target_id
    AND is_active = true
    AND (
      -- El nuevo rango se solapa con uno existente
      (NEW.start_date, COALESCE(NEW.end_date, '9999-12-31'::DATE))
      OVERLAPS
      (start_date, COALESCE(end_date, '9999-12-31'::DATE))
    );

  IF v_overlap_count > 0 THEN
    RAISE EXCEPTION 'Ya existe una tarifa personalizada activa para este paciente y servicio/bono en ese rango de fechas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_custom_price_overlap
  BEFORE INSERT OR UPDATE ON patient_custom_prices
  FOR EACH ROW EXECUTE FUNCTION check_custom_price_overlap();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_patient_custom_prices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pcp_updated_at
  BEFORE UPDATE ON patient_custom_prices
  FOR EACH ROW EXECUTE FUNCTION update_patient_custom_prices_updated_at();


-- 2. Tabla de historial de cambios
-- ============================================================
CREATE TABLE patient_custom_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_custom_price_id UUID NOT NULL REFERENCES patient_custom_prices(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL,
  center_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  old_price NUMERIC(10,2) NULL,
  new_price NUMERIC(10,2) NOT NULL,
  old_start_date DATE NULL,
  new_start_date DATE NOT NULL,
  old_end_date DATE NULL,
  new_end_date DATE NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'deactivated', 'expired')),
  changed_by UUID NOT NULL REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pcph_patient_id ON patient_custom_price_history(patient_id);
CREATE INDEX idx_pcph_custom_price_id ON patient_custom_price_history(patient_custom_price_id);


-- 3. Trigger automático de historial en patient_custom_prices
-- ============================================================
CREATE OR REPLACE FUNCTION record_custom_price_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO patient_custom_price_history (
      patient_custom_price_id, patient_id, center_id, target_type, target_id,
      old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
      change_type, changed_by
    ) VALUES (
      NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
      NULL, NEW.custom_price, NULL, NEW.start_date, NULL, NEW.end_date,
      'created', NEW.created_by
    );

  ELSIF TG_OP = 'UPDATE' THEN
    -- Detectar tipo de cambio
    IF OLD.is_active AND NOT NEW.is_active THEN
      INSERT INTO patient_custom_price_history (
        patient_custom_price_id, patient_id, center_id, target_type, target_id,
        old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
        change_type, changed_by
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
        OLD.custom_price, NEW.custom_price, OLD.start_date, NEW.start_date, OLD.end_date, NEW.end_date,
        'deactivated', NEW.created_by
      );
    ELSIF OLD.custom_price != NEW.custom_price
       OR OLD.start_date != NEW.start_date
       OR OLD.end_date IS DISTINCT FROM NEW.end_date THEN
      INSERT INTO patient_custom_price_history (
        patient_custom_price_id, patient_id, center_id, target_type, target_id,
        old_price, new_price, old_start_date, new_start_date, old_end_date, new_end_date,
        change_type, changed_by
      ) VALUES (
        NEW.id, NEW.patient_id, NEW.center_id, NEW.target_type, NEW.target_id,
        OLD.custom_price, NEW.custom_price, OLD.start_date, NEW.start_date, OLD.end_date, NEW.end_date,
        'updated', NEW.created_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_record_custom_price_history
  AFTER INSERT OR UPDATE ON patient_custom_prices
  FOR EACH ROW EXECUTE FUNCTION record_custom_price_history();


-- 4. Columnas snapshot en sessions
-- ============================================================
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS session_type_id UUID REFERENCES session_types(id),
  ADD COLUMN IF NOT EXISTS base_price_snapshot NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS pricing_source TEXT NULL CHECK (pricing_source IN ('base', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_price_id UUID NULL REFERENCES patient_custom_prices(id);

CREATE INDEX IF NOT EXISTS idx_sessions_session_type_id ON sessions(session_type_id);


-- 5. Columnas snapshot en bonos
-- ============================================================
ALTER TABLE bonos
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES bono_templates(id),
  ADD COLUMN IF NOT EXISTS base_price_snapshot NUMERIC(10,2) NULL,
  ADD COLUMN IF NOT EXISTS pricing_source TEXT NULL CHECK (pricing_source IN ('base', 'custom')),
  ADD COLUMN IF NOT EXISTS custom_price_id UUID NULL REFERENCES patient_custom_prices(id);


-- 6. RPC: resolve_applicable_price
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_applicable_price(
  p_patient_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_base_price NUMERIC(10,2);
  v_custom RECORD;
BEGIN
  -- Obtener precio base según el tipo
  IF p_target_type = 'session_type' THEN
    SELECT default_price INTO v_base_price
    FROM session_types
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);

  ELSIF p_target_type = 'bono_template' THEN
    SELECT total_price INTO v_base_price
    FROM bono_templates
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  END IF;

  -- Buscar tarifa personalizada activa para este paciente en la fecha de referencia
  SELECT *
  INTO v_custom
  FROM patient_custom_prices
  WHERE patient_id = p_patient_id
    AND target_type = p_target_type
    AND target_id = p_target_id
    AND is_active = true
    AND start_date <= p_reference_date
    AND (end_date IS NULL OR end_date >= p_reference_date)
  ORDER BY start_date DESC
  LIMIT 1;

  IF v_custom.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'base_price',       v_base_price,
      'applied_price',    v_custom.custom_price,
      'pricing_source',   'custom',
      'custom_price_id',  v_custom.id,
      'is_temporary',     v_custom.end_date IS NOT NULL,
      'valid_from',       v_custom.start_date,
      'valid_to',         v_custom.end_date,
      'note',             v_custom.notes
    );
  ELSE
    RETURN jsonb_build_object(
      'base_price',       v_base_price,
      'applied_price',    v_base_price,
      'pricing_source',   'base',
      'custom_price_id',  NULL,
      'is_temporary',     false,
      'valid_from',       NULL,
      'valid_to',         NULL,
      'note',             NULL
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 7. RLS Policies
-- ============================================================
ALTER TABLE patient_custom_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_custom_price_history ENABLE ROW LEVEL SECURITY;

-- patient_custom_prices: acceso solo a usuarios del mismo centro
CREATE POLICY "pcp_center_access" ON patient_custom_prices
  FOR ALL USING (
    center_id IN (
      SELECT center_id FROM profiles WHERE id = auth.uid()
    )
  );

-- patient_custom_price_history: solo lectura para usuarios del mismo centro
CREATE POLICY "pcph_center_read" ON patient_custom_price_history
  FOR SELECT USING (
    center_id IN (
      SELECT center_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "pcph_center_insert" ON patient_custom_price_history
  FOR INSERT WITH CHECK (
    center_id IN (
      SELECT center_id FROM profiles WHERE id = auth.uid()
    )
  );
