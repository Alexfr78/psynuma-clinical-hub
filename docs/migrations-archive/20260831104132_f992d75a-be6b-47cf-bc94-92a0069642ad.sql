-- =====================================================================
-- MODULO DE GASTOS -- Migracion completa
-- =====================================================================

CREATE TYPE public.expense_status AS ENUM ('pending', 'paid', 'cancelled');
CREATE TYPE public.expense_recurrence_frequency AS ENUM ('monthly', 'quarterly', 'yearly');
CREATE TYPE public.expense_kind AS ENUM ('fixed_recurring', 'variable', 'supplier_invoice', 'professional_payment');
CREATE TYPE public.compensation_type AS ENUM ('fixed', 'percentage', 'mixed');
CREATE TYPE public.compensation_basis AS ENUM ('collected_payments', 'issued_invoices');

-- 1. Categorias de gasto
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#64748B',
  icon text,
  is_professional_payment_category boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_categories TO authenticated;
GRANT ALL ON public.expense_categories TO service_role;

CREATE INDEX idx_expense_categories_center ON public.expense_categories(center_id, display_order, name);

CREATE TRIGGER update_expense_categories_updated_at
BEFORE UPDATE ON public.expense_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.expense_categories (center_id, name, color, icon, is_professional_payment_category, display_order)
SELECT c.id, v.name, v.color, v.icon, v.is_prof, v.ord
FROM public.centers c
CROSS JOIN (VALUES
  ('Alquiler',               '#EF4444', 'apartment',              false, 1),
  ('Suministros',            '#F59E0B', 'bolt',                   false, 2),
  ('Software y licencias',   '#6366F1', 'apps',                   false, 3),
  ('Seguros',                '#0EA5E9', 'shield',                 false, 4),
  ('Formacion',              '#22C55E', 'school',                 false, 5),
  ('Material clinico',       '#14B8A6', 'inventory_2',            false, 6),
  ('Marketing y publicidad', '#EC4899', 'campaign',               false, 7),
  ('Gestoria y asesoria',    '#8B5CF6', 'gavel',                  false, 8),
  ('Pagos a profesionales',  '#0891B2', 'diversity_3',            true,  9),
  ('Otros gastos',           '#64748B', 'more_horiz',             false, 10)
) AS v(name, color, icon, is_prof, ord)
ON CONFLICT (center_id, name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_expense_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.expense_categories (center_id, name, color, icon, is_professional_payment_category, display_order)
  VALUES
    (NEW.id, 'Alquiler',               '#EF4444', 'apartment',   false, 1),
    (NEW.id, 'Suministros',            '#F59E0B', 'bolt',        false, 2),
    (NEW.id, 'Software y licencias',   '#6366F1', 'apps',        false, 3),
    (NEW.id, 'Seguros',                '#0EA5E9', 'shield',      false, 4),
    (NEW.id, 'Formacion',              '#22C55E', 'school',      false, 5),
    (NEW.id, 'Material clinico',       '#14B8A6', 'inventory_2', false, 6),
    (NEW.id, 'Marketing y publicidad', '#EC4899', 'campaign',    false, 7),
    (NEW.id, 'Gestoria y asesoria',    '#8B5CF6', 'gavel',       false, 8),
    (NEW.id, 'Pagos a profesionales',  '#0891B2', 'diversity_3', true,  9),
    (NEW.id, 'Otros gastos',           '#64748B', 'more_horiz',  false, 10);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_default_expense_categories
AFTER INSERT ON public.centers
FOR EACH ROW EXECUTE FUNCTION public.seed_default_expense_categories();

CREATE OR REPLACE FUNCTION public.protect_professional_payment_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_professional_payment_category THEN
      RAISE EXCEPTION 'No se puede eliminar la categoría reservada para pagos a profesionales';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.is_professional_payment_category
     AND (NEW.is_active = false OR NEW.is_professional_payment_category = false) THEN
    RAISE EXCEPTION 'No se puede desactivar la categoría reservada para pagos a profesionales';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_professional_payment_category
BEFORE UPDATE OR DELETE ON public.expense_categories
FOR EACH ROW EXECUTE FUNCTION public.protect_professional_payment_category();

-- 2. Proveedores
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  tax_id text,
  address text,
  city text,
  postal_code text,
  province text,
  country text DEFAULT 'España',
  email text,
  phone text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

CREATE INDEX idx_suppliers_center ON public.suppliers(center_id, name);
CREATE UNIQUE INDEX idx_suppliers_center_taxid ON public.suppliers(center_id, tax_id) WHERE tax_id IS NOT NULL;

CREATE TRIGGER update_suppliers_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Plantillas de gasto recurrente
CREATE TABLE public.expense_recurring_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  description text NOT NULL,
  default_amount numeric(10,2) NOT NULL CHECK (default_amount >= 0),
  frequency public.expense_recurrence_frequency NOT NULL DEFAULT 'monthly',
  day_of_period smallint NOT NULL DEFAULT 1 CHECK (day_of_period BETWEEN 1 AND 28),
  anchor_month smallint CHECK (anchor_month BETWEEN 1 AND 12),
  is_active boolean NOT NULL DEFAULT true,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  default_payment_method text,
  vat_rate numeric(5,2),
  irpf_rate numeric(5,2),
  last_generated_period date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_recurring_templates TO authenticated;
GRANT ALL ON public.expense_recurring_templates TO service_role;

CREATE INDEX idx_expense_recurring_templates_center ON public.expense_recurring_templates(center_id, is_active);

CREATE TRIGGER update_expense_recurring_templates_updated_at
BEFORE UPDATE ON public.expense_recurring_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Acuerdos de compensacion
CREATE TABLE public.professional_compensation_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  compensation_type public.compensation_type NOT NULL DEFAULT 'fixed',
  fixed_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (fixed_amount >= 0),
  percentage_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (percentage_rate BETWEEN 0 AND 100),
  compensation_basis public.compensation_basis NOT NULL DEFAULT 'collected_payments',
  default_irpf_rate numeric(5,2),
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_compensation_agreements TO authenticated;
GRANT ALL ON public.professional_compensation_agreements TO service_role;

CREATE INDEX idx_compensation_agreements_professional ON public.professional_compensation_agreements(professional_id, is_active, effective_from);
CREATE INDEX idx_compensation_agreements_center ON public.professional_compensation_agreements(center_id);

CREATE UNIQUE INDEX idx_compensation_agreements_one_active
ON public.professional_compensation_agreements(professional_id)
WHERE is_active = true AND effective_to IS NULL;

CREATE TRIGGER update_compensation_agreements_updated_at
BEFORE UPDATE ON public.professional_compensation_agreements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Gastos
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  kind public.expense_kind NOT NULL DEFAULT 'variable',
  category_id uuid NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  compensation_agreement_id uuid REFERENCES public.professional_compensation_agreements(id) ON DELETE SET NULL,
  compensation_period_start date,
  compensation_period_end date,
  recurring_template_id uuid REFERENCES public.expense_recurring_templates(id) ON DELETE SET NULL,
  generated_period_start date,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  tax_base numeric(10,2),
  vat_rate numeric(5,2),
  vat_amount numeric(10,2),
  irpf_rate numeric(5,2),
  irpf_amount numeric(10,2),
  supplier_invoice_number text,
  invoice_issue_date date,
  operation_date date,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status public.expense_status NOT NULL DEFAULT 'pending',
  payment_method text,
  paid_at date,
  paid_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  attachment_path text,
  attachment_mime_type text,
  ai_extraction_status text CHECK (ai_extraction_status IN ('pending','processing','done','failed')),
  ai_extraction_raw jsonb,
  ai_extraction_confidence numeric(3,2),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expenses_professional_payment_requires_professional
    CHECK (kind <> 'professional_payment' OR professional_id IS NOT NULL),
  CONSTRAINT expenses_paid_amount_not_over_amount
    CHECK (paid_amount <= amount + 0.01)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

CREATE INDEX idx_expenses_center_date ON public.expenses(center_id, expense_date DESC);
CREATE INDEX idx_expenses_center_status_due ON public.expenses(center_id, status, due_date);
CREATE INDEX idx_expenses_category ON public.expenses(category_id);
CREATE INDEX idx_expenses_supplier ON public.expenses(supplier_id);
CREATE INDEX idx_expenses_professional ON public.expenses(professional_id);
CREATE INDEX idx_expenses_recurring_template ON public.expenses(recurring_template_id);
CREATE INDEX idx_expenses_created_by ON public.expenses(created_by);

CREATE TRIGGER update_expenses_updated_at
BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX idx_expenses_unique_recurring_period
ON public.expenses(recurring_template_id, generated_period_start)
WHERE recurring_template_id IS NOT NULL;

CREATE UNIQUE INDEX idx_expenses_unique_compensation_period
ON public.expenses(compensation_agreement_id, compensation_period_start)
WHERE compensation_agreement_id IS NOT NULL;

-- 6. RLS
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_recurring_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_compensation_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View expense categories in center"
ON public.expense_categories FOR SELECT TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Admins manage expense categories"
ON public.expense_categories FOR ALL TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "View suppliers in center"
ON public.suppliers FOR SELECT TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()));

CREATE POLICY "Manage suppliers in center"
ON public.suppliers FOR ALL TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
);

CREATE POLICY "View recurring expense templates in center"
ON public.expense_recurring_templates FOR SELECT TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "Admins manage recurring expense templates"
ON public.expense_recurring_templates FOR ALL TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "Admins manage compensation agreements"
ON public.professional_compensation_agreements FOR ALL TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "Professionals view their own compensation agreement"
ON public.professional_compensation_agreements FOR SELECT TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND professional_id = auth.uid()
);

CREATE POLICY "Admins manage all expenses in center"
ON public.expenses FOR ALL TO authenticated
USING (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()))
WITH CHECK (center_id = public.get_user_center_id(auth.uid()) AND public.is_admin(auth.uid()));

CREATE POLICY "Professionals insert their own expenses"
ON public.expenses FOR INSERT TO authenticated
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND public.is_professional(auth.uid())
  AND created_by = auth.uid()
  AND kind <> 'professional_payment'
);

CREATE POLICY "Professionals view their own expenses"
ON public.expenses FOR SELECT TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND public.is_professional(auth.uid())
  AND (created_by = auth.uid() OR professional_id = auth.uid())
);

CREATE POLICY "Professionals update their own pending expenses"
ON public.expenses FOR UPDATE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND public.is_professional(auth.uid())
  AND created_by = auth.uid()
  AND status = 'pending'
  AND kind <> 'professional_payment'
)
WITH CHECK (
  center_id = public.get_user_center_id(auth.uid())
  AND public.is_professional(auth.uid())
  AND created_by = auth.uid()
  AND kind <> 'professional_payment'
);

CREATE POLICY "Professionals delete their own pending expenses"
ON public.expenses FOR DELETE TO authenticated
USING (
  center_id = public.get_user_center_id(auth.uid())
  AND public.is_professional(auth.uid())
  AND created_by = auth.uid()
  AND status = 'pending'
  AND kind <> 'professional_payment'
);

-- 7. Storage policies (bucket 'expense-receipts' ya creado)
CREATE POLICY "Read expense receipts from own center"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Insert expense receipts into own center"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'expense-receipts'
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Update expense receipts in own center"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "Delete expense receipts in own center"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'expense-receipts'
  AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT center_id::text FROM public.profiles WHERE id = auth.uid())
);

-- 8. Calculo de comision variable
CREATE OR REPLACE FUNCTION public._calculate_professional_variable_amount_internal(
  p_professional_id uuid,
  p_center_id uuid,
  p_period_start date,
  p_period_end date,
  p_percentage_rate numeric,
  p_basis public.compensation_basis DEFAULT 'collected_payments'
)
RETURNS TABLE (collected_total numeric, variable_amount numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_basis = 'issued_invoices' THEN
    RETURN QUERY
    WITH direct_session_invoices AS (
      SELECT ii.total AS amount
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      JOIN public.sessions s ON s.id = ii.session_id
      WHERE s.professional_id = p_professional_id
        AND i.center_id = p_center_id
        AND i.status IN ('issued', 'paid')
        AND i.issue_date BETWEEN p_period_start AND p_period_end
    ),
    bono_invoices AS (
      SELECT ii.total
        * (bi_prof.session_count::numeric / NULLIF(bi_all.session_count, 0)) AS amount
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id AND ii.bono_id IS NOT NULL
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items bi
        JOIN public.sessions s ON s.id = bi.session_id
        WHERE s.professional_id = p_professional_id
        GROUP BY bono_id
      ) bi_prof ON bi_prof.bono_id = ii.bono_id
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items
        WHERE session_id IS NOT NULL
        GROUP BY bono_id
      ) bi_all ON bi_all.bono_id = ii.bono_id
      WHERE i.center_id = p_center_id
        AND i.status IN ('issued', 'paid')
        AND i.issue_date BETWEEN p_period_start AND p_period_end
    ),
    totals AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM direct_session_invoices
        UNION ALL SELECT amount FROM bono_invoices
      ) all_amounts
    )
    SELECT totals.total, ROUND(totals.total * COALESCE(p_percentage_rate, 0) / 100, 2)
    FROM totals;
  ELSE
    RETURN QUERY
    WITH direct_session_payments AS (
      SELECT p.amount
      FROM public.payments p
      JOIN public.sessions s ON s.id = p.session_id
      WHERE s.professional_id = p_professional_id
        AND s.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    invoice_session_payments AS (
      SELECT p.amount * (ii.total / NULLIF(inv_total.sum_total, 0)) AS amount
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      JOIN public.invoice_items ii ON ii.invoice_id = i.id
      JOIN public.sessions s ON s.id = ii.session_id
      JOIN (
        SELECT invoice_id, SUM(total) AS sum_total
        FROM public.invoice_items
        GROUP BY invoice_id
      ) inv_total ON inv_total.invoice_id = i.id
      WHERE p.session_id IS NULL
        AND s.professional_id = p_professional_id
        AND i.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    bono_payments AS (
      SELECT p.amount
        * (bi_prof.session_count::numeric / NULLIF(bi_all.session_count, 0)) AS amount
      FROM public.payments p
      JOIN public.invoices i ON i.id = p.invoice_id
      JOIN public.invoice_items ii ON ii.invoice_id = i.id AND ii.bono_id IS NOT NULL
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items bi
        JOIN public.sessions s ON s.id = bi.session_id
        WHERE s.professional_id = p_professional_id
        GROUP BY bono_id
      ) bi_prof ON bi_prof.bono_id = ii.bono_id
      JOIN (
        SELECT bono_id, COUNT(*) AS session_count
        FROM public.bono_items
        WHERE session_id IS NOT NULL
        GROUP BY bono_id
      ) bi_all ON bi_all.bono_id = ii.bono_id
      WHERE p.session_id IS NULL
        AND i.center_id = p_center_id
        AND p.status = 'paid'
        AND p.payment_date BETWEEN p_period_start AND p_period_end
    ),
    totals AS (
      SELECT COALESCE(SUM(amount), 0) AS total FROM (
        SELECT amount FROM direct_session_payments
        UNION ALL SELECT amount FROM invoice_session_payments
        UNION ALL SELECT amount FROM bono_payments
      ) all_amounts
    )
    SELECT totals.total, ROUND(totals.total * COALESCE(p_percentage_rate, 0) / 100, 2)
    FROM totals;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._calculate_professional_variable_amount_internal(uuid, uuid, date, date, numeric, public.compensation_basis) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._calculate_professional_variable_amount_internal(uuid, uuid, date, date, numeric, public.compensation_basis) TO service_role;

CREATE OR REPLACE FUNCTION public.calculate_professional_variable_amount(
  p_professional_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (collected_total numeric, variable_amount numeric, percentage_rate numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center_id uuid;
  v_rate numeric;
  v_basis public.compensation_basis;
BEGIN
  v_center_id := public.get_user_center_id(auth.uid());
  IF NOT (public.is_admin(auth.uid()) OR auth.uid() = p_professional_id) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT pca.percentage_rate, pca.compensation_basis INTO v_rate, v_basis
  FROM public.professional_compensation_agreements pca
  WHERE pca.professional_id = p_professional_id
    AND pca.is_active = true
    AND pca.effective_to IS NULL
  LIMIT 1;

  RETURN QUERY
  SELECT calc.collected_total, calc.variable_amount, COALESCE(v_rate, 0)
  FROM public._calculate_professional_variable_amount_internal(
    p_professional_id, v_center_id, p_period_start, p_period_end,
    COALESCE(v_rate, 0), COALESCE(v_basis, 'collected_payments')
  ) calc;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_professional_variable_amount(uuid, date, date) TO authenticated;

-- 9. Crons
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-recurring-expenses') THEN
    PERFORM cron.unschedule('generate-recurring-expenses');
  END IF;
END $$;

SELECT cron.schedule(
  'generate-recurring-expenses',
  '0 3 * * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/generate-recurring-expenses',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = 'payment_automation_cron_secret' LIMIT 1), ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-professional-payments') THEN
    PERFORM cron.unschedule('generate-professional-payments');
  END IF;
END $$;

SELECT cron.schedule(
  'generate-professional-payments',
  '0 4 1 * *',
  $job$
  SELECT net.http_post(
    url := 'https://zprkdxmluvirxfhswrzq.supabase.co/functions/v1/generate-professional-payments',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets
         WHERE name = 'payment_automation_cron_secret' LIMIT 1), ''
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);