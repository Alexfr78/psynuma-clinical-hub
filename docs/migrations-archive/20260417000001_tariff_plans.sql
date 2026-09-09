-- ============================================================
-- Sistema de planes tarifarios reutilizables
-- Capa 2 de precios: tariff_plans > patient_custom_prices > base
-- ============================================================

-- 1. Ampliar pricing_source para incluir 'tariff_plan'
-- ============================================================
ALTER TABLE sessions
  DROP CONSTRAINT IF EXISTS sessions_pricing_source_check;
ALTER TABLE sessions
  ADD CONSTRAINT sessions_pricing_source_check
  CHECK (pricing_source IN ('base', 'custom', 'tariff_plan'));

ALTER TABLE bonos
  DROP CONSTRAINT IF EXISTS bonos_pricing_source_check;
ALTER TABLE bonos
  ADD CONSTRAINT bonos_pricing_source_check
  CHECK (pricing_source IN ('base', 'custom', 'tariff_plan'));

-- Snapshot de tariff_plan en sessions y bonos
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS tariff_plan_id_snapshot UUID NULL,
  ADD COLUMN IF NOT EXISTS tariff_plan_assignment_id_snapshot UUID NULL;

ALTER TABLE bonos
  ADD COLUMN IF NOT EXISTS tariff_plan_id_snapshot UUID NULL,
  ADD COLUMN IF NOT EXISTS tariff_plan_assignment_id_snapshot UUID NULL;


-- 2. tariff_plans — planes tarifarios reutilizables por centro
-- ============================================================
CREATE TABLE tariff_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tariff_plans_center ON tariff_plans(center_id);
CREATE INDEX idx_tariff_plans_default ON tariff_plans(center_id, is_default) WHERE is_default = true;

-- Trigger: solo un plan default por centro
CREATE OR REPLACE FUNCTION enforce_single_default_tariff_plan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE tariff_plans
    SET is_default = false
    WHERE center_id = NEW.center_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_single_default_tariff_plan
  AFTER INSERT OR UPDATE ON tariff_plans
  FOR EACH ROW EXECUTE FUNCTION enforce_single_default_tariff_plan();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_tariff_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tariff_plans_updated_at
  BEFORE UPDATE ON tariff_plans
  FOR EACH ROW EXECUTE FUNCTION update_tariff_plans_updated_at();


-- 3. tariff_plan_items — líneas de precio por producto y plan
-- ============================================================
CREATE TABLE tariff_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tariff_plan_id UUID NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('session_type', 'bono_template')),
  target_id UUID NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tpi_unique_product UNIQUE (tariff_plan_id, target_type, target_id)
);

CREATE INDEX idx_tpi_tariff_plan ON tariff_plan_items(tariff_plan_id);
CREATE INDEX idx_tpi_target ON tariff_plan_items(target_type, target_id);

CREATE OR REPLACE FUNCTION update_tariff_plan_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tpi_updated_at
  BEFORE UPDATE ON tariff_plan_items
  FOR EACH ROW EXECUTE FUNCTION update_tariff_plan_items_updated_at();


-- 4. patient_tariff_plan_assignments — asignación de plan a paciente
-- ============================================================
CREATE TABLE patient_tariff_plan_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  tariff_plan_id UUID NOT NULL REFERENCES tariff_plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  created_by UUID NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ptpa_end_after_start CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX idx_ptpa_patient ON patient_tariff_plan_assignments(patient_id);
CREATE INDEX idx_ptpa_center ON patient_tariff_plan_assignments(center_id);
CREATE INDEX idx_ptpa_active ON patient_tariff_plan_assignments(patient_id, is_active);

-- Trigger: no solapar asignaciones activas para el mismo paciente
CREATE OR REPLACE FUNCTION check_tariff_assignment_overlap()
RETURNS TRIGGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM patient_tariff_plan_assignments
  WHERE id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
    AND patient_id = NEW.patient_id
    AND is_active = true
    AND (
      (NEW.start_date, COALESCE(NEW.end_date, '9999-12-31'::DATE))
      OVERLAPS
      (start_date, COALESCE(end_date, '9999-12-31'::DATE))
    );

  IF v_count > 0 THEN
    RAISE EXCEPTION 'Este paciente ya tiene una tarifa asignada activa en ese rango de fechas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_tariff_assignment_overlap
  BEFORE INSERT OR UPDATE ON patient_tariff_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION check_tariff_assignment_overlap();

CREATE OR REPLACE FUNCTION update_ptpa_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ptpa_updated_at
  BEFORE UPDATE ON patient_tariff_plan_assignments
  FOR EACH ROW EXECUTE FUNCTION update_ptpa_updated_at();


-- 5. RPC: resolve_effective_price — resolución de precio con 3 niveles de prioridad
-- ============================================================
-- Prioridad:
--   1. patient_custom_prices (excepción manual activa) → source = 'custom'
--   2. patient_tariff_plan_assignments + tariff_plan_items activos → source = 'tariff_plan'
--   3. Precio base del producto → source = 'base'
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_effective_price(
  p_patient_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
DECLARE
  v_base_price       NUMERIC(10,2);
  v_custom           RECORD;
  v_assignment       RECORD;
  v_tariff_price     NUMERIC(10,2);
  v_plan_name        TEXT;
BEGIN
  -- ── 0. Precio base del producto ────────────────────────────
  IF p_target_type = 'session_type' THEN
    SELECT default_price INTO v_base_price
    FROM session_types
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  ELSIF p_target_type = 'bono_template' THEN
    SELECT total_price INTO v_base_price
    FROM bono_templates
    WHERE id = p_target_id AND (is_active IS NULL OR is_active = true);
  END IF;

  -- ── 1. Excepción manual (máxima prioridad) ─────────────────
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
      'base_price',              v_base_price,
      'applied_price',           v_custom.custom_price,
      'pricing_source',          'custom',
      'tariff_plan_id',          NULL,
      'tariff_plan_name',        NULL,
      'tariff_plan_assignment_id', NULL,
      'custom_price_id',         v_custom.id,
      'is_temporary',            v_custom.end_date IS NOT NULL,
      'valid_from',              v_custom.start_date,
      'valid_to',                v_custom.end_date,
      'note',                    v_custom.notes
    );
  END IF;

  -- ── 2. Plan tarifario asignado al paciente ─────────────────
  SELECT a.*
  INTO v_assignment
  FROM patient_tariff_plan_assignments a
  WHERE a.patient_id = p_patient_id
    AND a.is_active = true
    AND a.start_date <= p_reference_date
    AND (a.end_date IS NULL OR a.end_date >= p_reference_date)
  ORDER BY a.start_date DESC
  LIMIT 1;

  IF v_assignment.id IS NOT NULL THEN
    SELECT tpi.price, tp.name
    INTO v_tariff_price, v_plan_name
    FROM tariff_plan_items tpi
    JOIN tariff_plans tp ON tp.id = tpi.tariff_plan_id
    WHERE tpi.tariff_plan_id = v_assignment.tariff_plan_id
      AND tpi.target_type = p_target_type
      AND tpi.target_id = p_target_id
      AND tp.is_active = true;

    IF v_tariff_price IS NOT NULL THEN
      RETURN jsonb_build_object(
        'base_price',              v_base_price,
        'applied_price',           v_tariff_price,
        'pricing_source',          'tariff_plan',
        'tariff_plan_id',          v_assignment.tariff_plan_id,
        'tariff_plan_name',        v_plan_name,
        'tariff_plan_assignment_id', v_assignment.id,
        'custom_price_id',         NULL,
        'is_temporary',            v_assignment.end_date IS NOT NULL,
        'valid_from',              v_assignment.start_date,
        'valid_to',                v_assignment.end_date,
        'note',                    v_assignment.notes
      );
    END IF;
  END IF;

  -- ── 3. Tarifa base (fallback) ──────────────────────────────
  RETURN jsonb_build_object(
    'base_price',              v_base_price,
    'applied_price',           v_base_price,
    'pricing_source',          'base',
    'tariff_plan_id',          NULL,
    'tariff_plan_name',        NULL,
    'tariff_plan_assignment_id', NULL,
    'custom_price_id',         NULL,
    'is_temporary',            false,
    'valid_from',              NULL,
    'valid_to',                NULL,
    'note',                    NULL
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retrocompatibilidad: resolve_applicable_price delega a resolve_effective_price
CREATE OR REPLACE FUNCTION resolve_applicable_price(
  p_patient_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB AS $$
BEGIN
  RETURN resolve_effective_price(p_patient_id, p_target_type, p_target_id, p_reference_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 6. RLS Policies
-- ============================================================
ALTER TABLE tariff_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tariff_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_tariff_plan_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tp_center_access" ON tariff_plans
  FOR ALL USING (
    center_id IN (SELECT center_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "tpi_center_access" ON tariff_plan_items
  FOR ALL USING (
    tariff_plan_id IN (
      SELECT tp.id FROM tariff_plans tp
      JOIN profiles p ON p.center_id = tp.center_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "ptpa_center_access" ON patient_tariff_plan_assignments
  FOR ALL USING (
    center_id IN (SELECT center_id FROM profiles WHERE id = auth.uid())
  );


-- 7. Datos de ejemplo (se insertan solo si no hay planes en ningún centro)
-- ============================================================
DO $$
DECLARE
  v_center_id UUID;
  v_session_type_id UUID;
  v_bono_template_id UUID;
  v_plan_general UUID;
  v_plan_reducida UUID;
  v_plan_social UUID;
BEGIN
  -- Tomar el primer centro activo
  SELECT id INTO v_center_id FROM centers LIMIT 1;
  IF v_center_id IS NULL THEN RETURN; END IF;

  -- No insertar si ya hay planes
  IF EXISTS (SELECT 1 FROM tariff_plans WHERE center_id = v_center_id) THEN RETURN; END IF;

  -- Primer session_type y bono_template del centro
  SELECT id INTO v_session_type_id FROM session_types WHERE center_id = v_center_id AND (is_active IS NULL OR is_active = true) LIMIT 1;
  SELECT id INTO v_bono_template_id FROM bono_templates WHERE center_id = v_center_id AND (is_active IS NULL OR is_active = true) LIMIT 1;

  -- Plan General (default)
  INSERT INTO tariff_plans (center_id, name, description, is_default, is_active)
  VALUES (v_center_id, 'Tarifa General', 'Precios estándar del centro', true, true)
  RETURNING id INTO v_plan_general;

  -- Plan Reducida
  INSERT INTO tariff_plans (center_id, name, description, is_default, is_active)
  VALUES (v_center_id, 'Tarifa Reducida', 'Para pacientes con recursos limitados o convenios especiales', false, true)
  RETURNING id INTO v_plan_reducida;

  -- Plan Social
  INSERT INTO tariff_plans (center_id, name, description, is_default, is_active)
  VALUES (v_center_id, 'Tarifa Social', 'Tarifa de atención social y colectivos vulnerables', false, true)
  RETURNING id INTO v_plan_social;

  -- Items para session_type (si existe)
  IF v_session_type_id IS NOT NULL THEN
    INSERT INTO tariff_plan_items (tariff_plan_id, target_type, target_id, price)
    VALUES
      (v_plan_general,  'session_type', v_session_type_id, 75.00),
      (v_plan_reducida, 'session_type', v_session_type_id, 60.00),
      (v_plan_social,   'session_type', v_session_type_id, 10.00);
  END IF;

  -- Items para bono_template (si existe)
  IF v_bono_template_id IS NOT NULL THEN
    INSERT INTO tariff_plan_items (tariff_plan_id, target_type, target_id, price)
    VALUES
      (v_plan_general,  'bono_template', v_bono_template_id, 195.00),
      (v_plan_reducida, 'bono_template', v_bono_template_id, 180.00),
      (v_plan_social,   'bono_template', v_bono_template_id, 150.00);
  END IF;

EXCEPTION WHEN OTHERS THEN
  -- Ignorar errores en seed data
  NULL;
END;
$$;
