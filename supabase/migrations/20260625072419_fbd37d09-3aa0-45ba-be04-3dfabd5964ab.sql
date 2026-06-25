-- Blindar facturas emitidas: prohibir DELETE de no-draft y prohibir cambios a campos
-- fiscales/identitarios en facturas emitidas. Bypass para rol service_role (edge functions).
-- Las únicas correcciones permitidas a facturas emitidas son via rectificativa (marca is_valid=false).

CREATE OR REPLACE FUNCTION public.protect_issued_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('request.jwt.claims', true)::json->>'role';
BEGIN
  -- service_role (edge functions, cron) puede operar libremente
  IF v_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status IS DISTINCT FROM 'draft' THEN
      RAISE EXCEPTION 'No se puede eliminar una factura emitida (%). Crea una factura rectificativa.', OLD.invoice_number
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: en draft, todo permitido
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Factura emitida: bloquear cambios a campos fiscales / identitarios
  IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.series_id IS DISTINCT FROM OLD.series_id
     OR NEW.issue_date IS DISTINCT FROM OLD.issue_date
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.center_id IS DISTINCT FROM OLD.center_id
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.tax_rate IS DISTINCT FROM OLD.tax_rate
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.retention_rate IS DISTINCT FROM OLD.retention_rate
     OR NEW.retention_amount IS DISTINCT FROM OLD.retention_amount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.rectified_invoice_id IS DISTINCT FROM OLD.rectified_invoice_id
     OR NEW.rectification_type IS DISTINCT FROM OLD.rectification_type
     OR NEW.rectification_reason_code IS DISTINCT FROM OLD.rectification_reason_code
     OR NEW.base_rectificada IS DISTINCT FROM OLD.base_rectificada
     OR NEW.cuota_rectificada IS DISTINCT FROM OLD.cuota_rectificada
     OR NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash
     OR NEW.previous_invoice_hash IS DISTINCT FROM OLD.previous_invoice_hash
     OR NEW.verifactu_hash IS DISTINCT FROM OLD.verifactu_hash
     OR NEW.verifactu_registration_id IS DISTINCT FROM OLD.verifactu_registration_id
     OR NEW.verifactu_qr IS DISTINCT FROM OLD.verifactu_qr
     OR NEW.verifactu_timestamp IS DISTINCT FROM OLD.verifactu_timestamp
  THEN
    RAISE EXCEPTION 'No se pueden modificar campos fiscales de una factura emitida (%). Crea una factura rectificativa.', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- No se puede revertir una factura emitida a borrador
  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'No se puede devolver una factura emitida a borrador (%).', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  -- is_valid sólo puede ir de true a false (rectificación), nunca al revés
  IF OLD.is_valid = false AND NEW.is_valid = true THEN
    RAISE EXCEPTION 'No se puede revalidar una factura ya rectificada (%).', OLD.invoice_number
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_issued_invoices ON public.invoices;
CREATE TRIGGER trg_protect_issued_invoices
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_issued_invoices();