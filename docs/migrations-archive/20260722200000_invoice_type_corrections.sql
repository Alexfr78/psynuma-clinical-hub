-- Atomic, idempotent correction of an issued invoice type.
-- Supports two distinct fiscal operations:
--   1. Rectifying invoice by substitution (R4/R5 + TipoRectificativa S)
--   2. Complete invoice replacing a valid simplified invoice (F3)

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS verifactu_invoice_type text,
  ADD COLUMN IF NOT EXISTS operation_date date,
  ADD COLUMN IF NOT EXISTS recipient_snapshot jsonb;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_verifactu_invoice_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_verifactu_invoice_type_check
  CHECK (
    verifactu_invoice_type IS NULL
    OR verifactu_invoice_type IN ('F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5')
  );

CREATE TABLE IF NOT EXISTS public.invoice_correction_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  original_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  resulting_invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  operation_type text NOT NULL CHECK (
    operation_type IN ('rectificativa_substitution', 'f3_replacement')
  ),
  idempotency_key uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'preparing' CHECK (
    status IN (
      'preparing', 'local_created', 'registering', 'registered',
      'pending_aeat', 'rejected', 'manual_review'
    )
  ),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (original_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_correction_operations_center
  ON public.invoice_correction_operations(center_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_correction_operations_result
  ON public.invoice_correction_operations(resulting_invoice_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS correction_operation_id uuid
  REFERENCES public.invoice_correction_operations(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_correction_operation_unique
  ON public.invoices(correction_operation_id)
  WHERE correction_operation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoice_substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE RESTRICT,
  replacement_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  substituted_invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replacement_invoice_id, substituted_invoice_id),
  UNIQUE (substituted_invoice_id),
  CHECK (replacement_invoice_id <> substituted_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_substitutions_replacement
  ON public.invoice_substitutions(replacement_invoice_id);

ALTER TABLE public.invoice_correction_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_substitutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view invoice correction operations" ON public.invoice_correction_operations;
CREATE POLICY "Admins can view invoice correction operations"
  ON public.invoice_correction_operations FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND center_id = public.get_user_center_id(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can view invoice substitutions" ON public.invoice_substitutions;
CREATE POLICY "Admins can view invoice substitutions"
  ON public.invoice_substitutions FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND center_id = public.get_user_center_id(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.format_invoice_number_from_series(
  p_format text,
  p_series_name text,
  p_next_number integer,
  p_issue_date date
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT replace(
    replace(
      replace(
        replace(
          replace(
            replace(COALESCE(p_format, '{SERIE}-{AAAA}-{NNNNN}'),
              '{SERIE}', p_series_name),
            '{AAAA}', to_char(p_issue_date, 'YYYY')),
          '{AA}', to_char(p_issue_date, 'YY')),
        '{NNNNN}', lpad(p_next_number::text, 5, '0')),
      '{NNNN}', lpad(p_next_number::text, 4, '0')),
    '{NNN}', lpad(p_next_number::text, 3, '0'));
$$;

REVOKE ALL ON FUNCTION public.format_invoice_number_from_series(text, text, integer, date) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.move_invoice_financials_for_replacement(
  p_original_invoice_id uuid,
  p_target_invoice_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.invoices%ROWTYPE;
  v_original public.invoices%ROWTYPE;
  v_paid numeric := 0;
  v_payment_count integer := 0;
  v_debt_status public.payment_status;
  v_effective_paid numeric := 0;
BEGIN
  SELECT * INTO v_original
  FROM public.invoices
  WHERE id = p_original_invoice_id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.invoices
  WHERE id = p_target_invoice_id
  FOR UPDATE;

  IF v_original.id IS NULL OR v_target.id IS NULL THEN
    RAISE EXCEPTION 'No se encontraron las facturas para trasladar los cobros';
  END IF;

  IF v_original.center_id <> v_target.center_id
    OR v_original.patient_id <> v_target.patient_id THEN
    RAISE EXCEPTION 'Las facturas de origen y destino no pertenecen al mismo centro y contacto';
  END IF;

  UPDATE public.payments
  SET invoice_id = p_target_invoice_id,
      notes = concat_ws(' | ', NULLIF(notes, ''),
        format('Reasignado de %s por correccion de tipo de factura.', v_original.invoice_number)),
      updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  GET DIAGNOSTICS v_payment_count = ROW_COUNT;

  SELECT COALESCE(sum(amount), 0)
  INTO v_paid
  FROM public.payments
  WHERE invoice_id = p_target_invoice_id;

  v_effective_paid := CASE
    WHEN v_original.status = 'paid' AND v_paid = 0 THEN v_target.total
    ELSE LEAST(v_paid, v_target.total)
  END;

  v_debt_status := CASE
    WHEN v_effective_paid >= v_target.total THEN 'paid'::public.payment_status
    WHEN v_effective_paid > 0 THEN 'partial'::public.payment_status
    ELSE 'pending'::public.payment_status
  END;

  UPDATE public.debts
  SET status = 'refunded',
      paid_amount = 0,
      notes = concat_ws(' | ', NULLIF(notes, ''),
        format('Deuda cerrada: factura sustituida por %s.', v_target.invoice_number)),
      updated_at = now()
  WHERE invoice_id = p_original_invoice_id;

  UPDATE public.debts
  SET amount = v_target.total,
      paid_amount = v_effective_paid,
      status = v_debt_status,
      updated_at = now()
  WHERE invoice_id = v_target.id;

  IF NOT FOUND THEN
    INSERT INTO public.debts (
      patient_id, center_id, invoice_id, amount, paid_amount, status, due_date, notes
    ) VALUES (
      v_target.patient_id,
      v_target.center_id,
      v_target.id,
      v_target.total,
      v_effective_paid,
      v_debt_status,
      COALESCE(v_target.due_date, v_target.issue_date),
      'Deuda trasladada por correccion de tipo de factura'
    );
  END IF;

  IF v_debt_status = 'paid' THEN
    UPDATE public.invoices SET status = 'paid', updated_at = now()
    WHERE id = p_target_invoice_id;
  END IF;

  RETURN jsonb_build_object(
    'payment_count', v_payment_count,
    'paid_amount', v_effective_paid,
    'debt_status', v_debt_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_invoice_financials_for_replacement(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_invoice_type_correction_context(p_original_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_existing record;
  v_series jsonb;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo administradores pueden corregir el tipo de una factura';
  END IF;

  SELECT i.*, s.invoice_type AS source_invoice_type
  INTO v_invoice
  FROM public.invoices i
  LEFT JOIN public.invoice_series s ON s.id = i.series_id
  WHERE i.id = p_original_invoice_id
    AND i.center_id = public.get_user_center_id(auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  SELECT id, operation_type, status, resulting_invoice_id
  INTO v_existing
  FROM public.invoice_correction_operations
  WHERE original_invoice_id = p_original_invoice_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'series_type', s.series_type,
    'invoice_type', s.invoice_type,
    'is_default', s.is_default,
    'next_number', s.next_number
  ) ORDER BY s.series_type, s.invoice_type, s.name), '[]'::jsonb)
  INTO v_series
  FROM public.invoice_series s
  WHERE s.center_id = v_invoice.center_id
    AND COALESCE(s.is_archived, false) = false
    AND (
      (s.series_type = 'rectifying' AND s.invoice_type = COALESCE(v_invoice.source_invoice_type, 'complete'))
      OR (s.series_type = 'ordinary' AND s.invoice_type = 'complete')
    );

  SELECT jsonb_build_object(
    'eligible',
      v_invoice.status IN ('issued', 'paid')
      AND v_invoice.is_valid
      AND v_invoice.rectified_invoice_id IS NULL
      AND v_invoice.verifactu_hash IS NOT NULL
      AND COALESCE(v_invoice.verifactu_pending, false) = false
      AND v_existing.id IS NULL,
    'blocker', CASE
      WHEN v_existing.id IS NOT NULL THEN 'already_corrected'
      WHEN v_invoice.status NOT IN ('issued', 'paid') THEN 'invalid_status'
      WHEN NOT v_invoice.is_valid THEN 'invalidated'
      WHEN v_invoice.rectified_invoice_id IS NOT NULL THEN 'is_rectificativa'
      WHEN v_invoice.verifactu_hash IS NULL THEN 'not_fiscally_sealed'
      WHEN COALESCE(v_invoice.verifactu_pending, false) THEN 'aeat_pending'
      ELSE NULL
    END,
    'source_invoice_type', COALESCE(v_invoice.source_invoice_type, 'complete'),
    'can_create_f3', COALESCE(v_invoice.source_invoice_type, 'complete') = 'simplified',
    'existing_operation', CASE WHEN v_existing.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_existing.id,
      'operation_type', v_existing.operation_type,
      'status', v_existing.status,
      'resulting_invoice_id', v_existing.resulting_invoice_id
    ) END,
    'recipient', jsonb_build_object(
      'name', concat_ws(' ', p.first_name, p.last_name),
      'tax_id', p.tax_id,
      'address', p.address,
      'city', p.city,
      'postal_code', p.postal_code,
      'email', p.email
    ),
    'series', v_series
  ) INTO v_result
  FROM public.patients p
  WHERE p.id = v_invoice.patient_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_rectificativa_substitution(
  p_original_invoice_id uuid,
  p_series_id uuid,
  p_recipient jsonb,
  p_update_patient boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_center uuid := public.get_user_center_id(auth.uid());
  v_original public.invoices%ROWTYPE;
  v_series public.invoice_series%ROWTYPE;
  v_source_type text;
  v_fiscal_type text;
  v_operation public.invoice_correction_operations%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_number text;
  v_financials jsonb;
  v_today date := current_date;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo administradores pueden corregir el tipo de una factura';
  END IF;

  SELECT * INTO v_operation
  FROM public.invoice_correction_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_operation.original_invoice_id <> p_original_invoice_id
      OR v_operation.operation_type <> 'rectificativa_substitution' THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se utilizo para otra operacion';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_operation.resulting_invoice_id;
    RETURN jsonb_build_object(
      'operation_id', v_operation.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_operation.status,
      'already_created', true
    );
  END IF;

  SELECT i.* INTO v_original
  FROM public.invoices i
  WHERE i.id = p_original_invoice_id AND i.center_id = v_center
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Factura original no encontrada'; END IF;
  IF v_original.status NOT IN ('issued', 'paid') OR NOT v_original.is_valid THEN
    RAISE EXCEPTION 'La factura original no es elegible para correccion';
  END IF;
  IF v_original.rectified_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede aplicar esta correccion sobre una rectificativa';
  END IF;
  IF v_original.verifactu_hash IS NULL OR COALESCE(v_original.verifactu_pending, false) THEN
    RAISE EXCEPTION 'La factura original debe estar cerrada fiscalmente y sin envio pendiente';
  END IF;

  SELECT * INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id AND center_id = v_center
  FOR UPDATE;

  IF NOT FOUND OR v_series.series_type <> 'rectifying' OR COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'La serie seleccionada no es una serie rectificativa activa';
  END IF;

  SELECT COALESCE(s.invoice_type, 'complete') INTO v_source_type
  FROM public.invoice_series s WHERE s.id = v_original.series_id;
  v_source_type := COALESCE(v_source_type, 'complete');

  IF v_series.invoice_type <> v_source_type THEN
    RAISE EXCEPTION 'La serie rectificativa debe corresponder al tipo de la factura original';
  END IF;

  v_fiscal_type := CASE WHEN v_source_type = 'simplified' THEN 'R5' ELSE 'R4' END;
  v_invoice_number := public.format_invoice_number_from_series(
    v_series.format, v_series.name, v_series.next_number, v_today
  );

  IF v_fiscal_type = 'R4' AND NULLIF(trim(p_recipient->>'tax_id'), '') IS NULL THEN
    RAISE EXCEPTION 'La rectificativa completa requiere NIF del destinatario';
  END IF;

  INSERT INTO public.invoice_correction_operations (
    center_id, original_invoice_id, operation_type, idempotency_key, requested_by, status
  ) VALUES (
    v_center, v_original.id, 'rectificativa_substitution', p_idempotency_key, v_actor, 'preparing'
  ) RETURNING * INTO v_operation;

  INSERT INTO public.invoices (
    center_id, patient_id, invoice_number, series_id, status, issue_date, due_date,
    subtotal, tax_rate, tax_amount, retention_rate, retention_amount, total,
    is_recapitulative, is_valid, notes, rectified_invoice_id, rectification_type,
    rectification_reason_code, base_rectificada, cuota_rectificada,
    verifactu_invoice_type, operation_date, recipient_snapshot, correction_operation_id
  ) VALUES (
    v_original.center_id, v_original.patient_id, v_invoice_number, v_series.id, 'issued', v_today, v_today,
    v_original.subtotal, v_original.tax_rate, v_original.tax_amount,
    v_original.retention_rate, v_original.retention_amount, v_original.total,
    false, true,
    format('Rectificativa sustitutiva de %s por correccion del tipo de factura', v_original.invoice_number),
    v_original.id, 'substitution', v_fiscal_type,
    v_original.subtotal, COALESCE(v_original.tax_amount, 0),
    v_fiscal_type, COALESCE(v_original.operation_date, v_original.issue_date),
    p_recipient, v_operation.id
  ) RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items (
    invoice_id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  )
  SELECT v_invoice.id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  FROM public.invoice_items
  WHERE invoice_id = v_original.id;

  UPDATE public.invoice_series SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_series.id;

  UPDATE public.invoices SET is_valid = false, updated_at = now()
  WHERE id = v_original.id;

  IF p_update_patient THEN
    UPDATE public.patients
    SET tax_id = COALESCE(NULLIF(trim(p_recipient->>'tax_id'), ''), tax_id),
        address = COALESCE(NULLIF(trim(p_recipient->>'address'), ''), address),
        city = COALESCE(NULLIF(trim(p_recipient->>'city'), ''), city),
        postal_code = COALESCE(NULLIF(trim(p_recipient->>'postal_code'), ''), postal_code),
        updated_at = now()
    WHERE id = v_original.patient_id AND center_id = v_center;
  END IF;

  v_financials := public.move_invoice_financials_for_replacement(v_original.id, v_invoice.id);

  UPDATE public.invoice_correction_operations
  SET resulting_invoice_id = v_invoice.id, status = 'local_created', updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'status', 'local_created',
    'verifactu_invoice_type', v_fiscal_type,
    'rectification_type', 'S',
    'financials', v_financials,
    'already_created', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_f3_replacement(
  p_original_invoice_id uuid,
  p_series_id uuid,
  p_recipient jsonb,
  p_update_patient boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_center uuid := public.get_user_center_id(auth.uid());
  v_original public.invoices%ROWTYPE;
  v_series public.invoice_series%ROWTYPE;
  v_source_type text;
  v_operation public.invoice_correction_operations%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_invoice_number text;
  v_financials jsonb;
  v_today date := current_date;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo administradores pueden emitir una factura F3';
  END IF;

  SELECT * INTO v_operation
  FROM public.invoice_correction_operations
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_operation.original_invoice_id <> p_original_invoice_id
      OR v_operation.operation_type <> 'f3_replacement' THEN
      RAISE EXCEPTION 'La clave de idempotencia ya se utilizo para otra operacion';
    END IF;
    SELECT * INTO v_invoice FROM public.invoices WHERE id = v_operation.resulting_invoice_id;
    RETURN jsonb_build_object(
      'operation_id', v_operation.id,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'status', v_operation.status,
      'already_created', true
    );
  END IF;

  SELECT i.* INTO v_original
  FROM public.invoices i
  WHERE i.id = p_original_invoice_id AND i.center_id = v_center
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Factura original no encontrada'; END IF;
  IF v_original.status NOT IN ('issued', 'paid') OR NOT v_original.is_valid THEN
    RAISE EXCEPTION 'La factura original no es elegible para sustitucion F3';
  END IF;
  IF v_original.rectified_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una rectificativa no se puede sustituir mediante F3';
  END IF;
  IF v_original.verifactu_hash IS NULL OR COALESCE(v_original.verifactu_pending, false) THEN
    RAISE EXCEPTION 'La factura original debe estar cerrada fiscalmente y sin envio pendiente';
  END IF;

  SELECT COALESCE(s.invoice_type, 'complete') INTO v_source_type
  FROM public.invoice_series s WHERE s.id = v_original.series_id;
  IF COALESCE(v_source_type, 'complete') <> 'simplified' THEN
    RAISE EXCEPTION 'F3 solo puede sustituir facturas simplificadas validas';
  END IF;

  IF NULLIF(trim(p_recipient->>'name'), '') IS NULL
    OR NULLIF(trim(p_recipient->>'tax_id'), '') IS NULL THEN
    RAISE EXCEPTION 'La factura completa requiere nombre y NIF del destinatario';
  END IF;

  SELECT * INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id AND center_id = v_center
  FOR UPDATE;

  IF NOT FOUND OR v_series.series_type <> 'ordinary'
    OR v_series.invoice_type <> 'complete' OR COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'F3 requiere una serie ordinaria completa activa';
  END IF;

  v_invoice_number := public.format_invoice_number_from_series(
    v_series.format, v_series.name, v_series.next_number, v_today
  );

  INSERT INTO public.invoice_correction_operations (
    center_id, original_invoice_id, operation_type, idempotency_key, requested_by, status
  ) VALUES (
    v_center, v_original.id, 'f3_replacement', p_idempotency_key, v_actor, 'preparing'
  ) RETURNING * INTO v_operation;

  INSERT INTO public.invoices (
    center_id, patient_id, invoice_number, series_id, status, issue_date, due_date,
    subtotal, tax_rate, tax_amount, retention_rate, retention_amount, total,
    is_recapitulative, is_valid, notes, verifactu_invoice_type, operation_date,
    recipient_snapshot, correction_operation_id
  ) VALUES (
    v_original.center_id, v_original.patient_id, v_invoice_number, v_series.id, 'issued', v_today, v_today,
    v_original.subtotal, v_original.tax_rate, v_original.tax_amount,
    v_original.retention_rate, v_original.retention_amount, v_original.total,
    false, true,
    format('Factura completa F3 en sustitucion de %s', v_original.invoice_number),
    'F3', COALESCE(v_original.operation_date, v_original.issue_date),
    p_recipient, v_operation.id
  ) RETURNING * INTO v_invoice;

  INSERT INTO public.invoice_items (
    invoice_id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  )
  SELECT v_invoice.id, session_id, billable_event_id, description, quantity, unit_price,
    tax_rate, tax_name, tax_amount, retention_rate, retention_name,
    retention_amount, total, bono_id
  FROM public.invoice_items
  WHERE invoice_id = v_original.id;

  INSERT INTO public.invoice_substitutions (
    center_id, replacement_invoice_id, substituted_invoice_id, created_by
  ) VALUES (v_center, v_invoice.id, v_original.id, v_actor);

  UPDATE public.invoice_series SET next_number = next_number + 1, updated_at = now()
  WHERE id = v_series.id;

  UPDATE public.invoices SET is_valid = false, updated_at = now()
  WHERE id = v_original.id;

  IF p_update_patient THEN
    UPDATE public.patients
    SET tax_id = COALESCE(NULLIF(trim(p_recipient->>'tax_id'), ''), tax_id),
        address = COALESCE(NULLIF(trim(p_recipient->>'address'), ''), address),
        city = COALESCE(NULLIF(trim(p_recipient->>'city'), ''), city),
        postal_code = COALESCE(NULLIF(trim(p_recipient->>'postal_code'), ''), postal_code),
        updated_at = now()
    WHERE id = v_original.patient_id AND center_id = v_center;
  END IF;

  v_financials := public.move_invoice_financials_for_replacement(v_original.id, v_invoice.id);

  UPDATE public.invoice_correction_operations
  SET resulting_invoice_id = v_invoice.id, status = 'local_created', updated_at = now()
  WHERE id = v_operation.id;

  RETURN jsonb_build_object(
    'operation_id', v_operation.id,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'status', 'local_created',
    'verifactu_invoice_type', 'F3',
    'financials', v_financials,
    'already_created', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_type_correction_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_rectificativa_substitution(uuid, uuid, jsonb, boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_f3_replacement(uuid, uuid, jsonb, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_invoice_type_correction_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_rectificativa_substitution(uuid, uuid, jsonb, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_f3_replacement(uuid, uuid, jsonb, boolean, uuid) TO authenticated;

COMMENT ON COLUMN public.invoices.verifactu_invoice_type IS
  'Explicit immutable AEAT invoice type. New fiscal flows set this; legacy rows continue using inference.';
COMMENT ON COLUMN public.invoices.recipient_snapshot IS
  'Immutable fiscal recipient data captured at invoice issue time.';
COMMENT ON TABLE public.invoice_substitutions IS
  'Links F3 complete invoices to the valid simplified invoices they replace; distinct from rectification.';
COMMENT ON TABLE public.invoice_correction_operations IS
  'Idempotent saga state for one-click invoice type corrections.';
