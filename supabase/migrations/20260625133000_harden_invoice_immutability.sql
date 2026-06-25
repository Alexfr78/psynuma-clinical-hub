-- Harden invoice and invoice item immutability after fiscal issuance/registration.

DROP TRIGGER IF EXISTS prevent_signed_invoice_modification_trigger ON public.invoices;
DROP TRIGGER IF EXISTS trg_protect_issued_invoices ON public.invoices;

CREATE OR REPLACE FUNCTION public.protect_invoice_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_locked boolean := (
    OLD.invoice_hash IS NOT NULL
    OR OLD.verifactu_hash IS NOT NULL
    OR OLD.verifactu_registration_id IS NOT NULL
  );
  v_allowed_keys text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_old_locked OR COALESCE(OLD.status::text, 'draft') <> 'draft' THEN
      RAISE EXCEPTION 'No se puede eliminar una factura emitida o fiscalmente registrada';
    END IF;

    RETURN OLD;
  END IF;

  IF COALESCE(OLD.status::text, 'draft') = 'draft' AND NOT v_old_locked THEN
    RETURN NEW;
  END IF;

  IF NEW.status::text = 'draft' AND COALESCE(OLD.status::text, 'draft') <> 'draft' THEN
    RAISE EXCEPTION 'No se puede devolver una factura emitida a borrador';
  END IF;

  IF OLD.status::text = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'No se puede cambiar el estado de una factura cancelada';
  END IF;

  IF OLD.is_valid = false AND NEW.is_valid IS DISTINCT FROM OLD.is_valid THEN
    RAISE EXCEPTION 'No se puede reactivar una factura invalidada fiscalmente';
  END IF;

  IF v_old_locked THEN
    v_allowed_keys := ARRAY[
      'updated_at',
      'status',
      'is_valid',
      'verifactu_pending',
      'verifactu_retry_count',
      'verifactu_error_permanent',
      'verifactu_error_message'
    ];
  ELSE
    -- Issued but not yet locked: allow the signing/registration metadata to be set once.
    v_allowed_keys := ARRAY[
      'updated_at',
      'status',
      'is_valid',
      'invoice_hash',
      'previous_invoice_hash',
      'verifactu_hash',
      'verifactu_qr',
      'verifactu_timestamp',
      'verifactu_registration_id',
      'verifactu_pending',
      'verifactu_retry_count',
      'verifactu_error_permanent',
      'verifactu_error_message'
    ];
  END IF;

  IF (to_jsonb(NEW) - v_allowed_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_keys) THEN
    RAISE EXCEPTION 'No se pueden modificar los datos fiscales de una factura emitida o registrada';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_invoice_immutability
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.protect_invoice_immutability();

CREATE OR REPLACE FUNCTION public.assert_invoice_items_mutable(p_invoice_id uuid, p_operation text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked boolean;
  v_operation_label text := CASE p_operation
    WHEN 'INSERT' THEN 'anadir'
    WHEN 'UPDATE' THEN 'modificar'
    WHEN 'DELETE' THEN 'eliminar'
    ELSE lower(p_operation)
  END;
BEGIN
  SELECT
    invoice_hash IS NOT NULL
    OR verifactu_hash IS NOT NULL
    OR verifactu_registration_id IS NOT NULL
  INTO v_locked
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la factura asociada a la linea';
  END IF;

  IF v_locked THEN
    RAISE EXCEPTION 'No se pueden % lineas de una factura fiscalmente registrada', v_operation_label;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_invoice_items_immutability ON public.invoice_items;

CREATE OR REPLACE FUNCTION public.protect_invoice_items_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.assert_invoice_items_mutable(OLD.invoice_id, TG_OP);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.assert_invoice_items_mutable(NEW.invoice_id, TG_OP);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_invoice_items_immutability
BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_items
FOR EACH ROW
EXECUTE FUNCTION public.protect_invoice_items_immutability();

COMMENT ON FUNCTION public.protect_invoice_immutability() IS
  'Prevents mutation of fiscal invoice data after issue/sign/Verifactu registration.';

COMMENT ON FUNCTION public.protect_invoice_items_immutability() IS
  'Prevents invoice item mutation once the parent invoice has a fiscal hash or Verifactu registration.';
