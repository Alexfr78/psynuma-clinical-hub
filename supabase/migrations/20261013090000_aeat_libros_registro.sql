-- Libros Registro normalizados de la AEAT (Pre303 / modelo 130 / Renta Web).
-- Datos fiscales mínimos que el diseño exige y que Psycma no guardaba.
-- Alcance v1: autónomos (persona física), libro unificado IVA + IRPF (tipo "T").

-- 1. Actividad económica del centro (columnas C, D y E de ambos libros).
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS aeat_activity_code text NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS aeat_activity_type text NOT NULL DEFAULT '05',
  ADD COLUMN IF NOT EXISTS aeat_iae_epigraph text;

ALTER TABLE public.centers
  DROP CONSTRAINT IF EXISTS centers_aeat_activity_code_check,
  ADD CONSTRAINT centers_aeat_activity_code_check
    CHECK (aeat_activity_code IN ('A', 'B', 'C', 'D')),
  DROP CONSTRAINT IF EXISTS centers_aeat_activity_type_check,
  ADD CONSTRAINT centers_aeat_activity_type_check
    CHECK (aeat_activity_type ~ '^0[1-6]$'),
  DROP CONSTRAINT IF EXISTS centers_aeat_iae_epigraph_check,
  ADD CONSTRAINT centers_aeat_iae_epigraph_check
    CHECK (aeat_iae_epigraph IS NULL OR length(aeat_iae_epigraph) <= 7);

-- 2. Concepto de gasto AEAT por categoría (columna G de RECIBIDAS_GASTOS).
ALTER TABLE public.expense_categories
  ADD COLUMN IF NOT EXISTS aeat_expense_concept text;

ALTER TABLE public.expense_categories
  DROP CONSTRAINT IF EXISTS expense_categories_aeat_expense_concept_check,
  ADD CONSTRAINT expense_categories_aeat_expense_concept_check
    CHECK (aeat_expense_concept IS NULL OR aeat_expense_concept ~ '^(G[0-4][0-9]|GY4|GY8)$');

-- Valor inicial para las categorías creadas por defecto (solo si siguen vacías).
UPDATE public.expense_categories
SET aeat_expense_concept = CASE name
    WHEN 'Alquiler'               THEN 'G12'
    WHEN 'Suministros'            THEN 'GY4'
    WHEN 'Software y licencias'   THEN 'G22'
    WHEN 'Seguros'                THEN 'G20'
    WHEN 'Formacion'              THEN 'G22'
    WHEN 'Material clinico'       THEN 'G03'
    WHEN 'Marketing y publicidad' THEN 'G22'
    WHEN 'Gestoria y asesoria'    THEN 'G19'
    WHEN 'Pagos a profesionales'  THEN 'G19'
    WHEN 'Otros gastos'           THEN 'G37'
    WHEN 'Gastos Bancarios'       THEN 'G24'
  END
WHERE aeat_expense_concept IS NULL
  AND name IN ('Alquiler', 'Suministros', 'Software y licencias', 'Seguros', 'Formacion',
               'Material clinico', 'Marketing y publicidad', 'Gestoria y asesoria',
               'Pagos a profesionales', 'Otros gastos', 'Gastos Bancarios');

CREATE OR REPLACE FUNCTION public.seed_default_expense_categories()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.expense_categories (center_id, name, color, icon, is_professional_payment_category, display_order, aeat_expense_concept)
  VALUES
    (NEW.id, 'Alquiler',               '#EF4444', 'apartment',   false, 1,  'G12'),
    (NEW.id, 'Suministros',            '#F59E0B', 'bolt',        false, 2,  'GY4'),
    (NEW.id, 'Software y licencias',   '#6366F1', 'apps',        false, 3,  'G22'),
    (NEW.id, 'Seguros',                '#0EA5E9', 'shield',      false, 4,  'G20'),
    (NEW.id, 'Formacion',              '#22C55E', 'school',      false, 5,  'G22'),
    (NEW.id, 'Material clinico',       '#14B8A6', 'inventory_2', false, 6,  'G03'),
    (NEW.id, 'Marketing y publicidad', '#EC4899', 'campaign',    false, 7,  'G22'),
    (NEW.id, 'Gestoria y asesoria',    '#8B5CF6', 'gavel',       false, 8,  'G19'),
    (NEW.id, 'Pagos a profesionales',  '#0891B2', 'diversity_3', true,  9,  'G19'),
    (NEW.id, 'Otros gastos',           '#64748B', 'more_horiz',  false, 10, 'G37');
  RETURN NEW;
END;
$function$;

-- 3. Datos del gasto que el libro de recibidas necesita.
--    deductible_vat_amount NULL = toda la cuota soportada es deducible.
--    irpf_deductible_amount NULL = el gasto deducible IRPF es la base imponible.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS aeat_invoice_type text NOT NULL DEFAULT 'F1',
  ADD COLUMN IF NOT EXISTS deductible_vat_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS irpf_deductible_amount numeric(12,2);

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_aeat_invoice_type_check,
  ADD CONSTRAINT expenses_aeat_invoice_type_check
    CHECK (aeat_invoice_type IN ('F1','F2','F3','F4','F5','F6','R1','R2','R3','R4','R5','LC','SF')),
  DROP CONSTRAINT IF EXISTS expenses_deductible_vat_amount_check,
  ADD CONSTRAINT expenses_deductible_vat_amount_check
    CHECK (deductible_vat_amount IS NULL OR deductible_vat_amount >= 0),
  DROP CONSTRAINT IF EXISTS expenses_irpf_deductible_amount_check,
  ADD CONSTRAINT expenses_irpf_deductible_amount_check
    CHECK (irpf_deductible_amount IS NULL OR irpf_deductible_amount >= 0);
