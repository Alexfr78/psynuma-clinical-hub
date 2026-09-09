-- Allow AEAT registration metadata to complete invoices that were locally sealed
-- before the canonical Verifactu registration flow was introduced.

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
  v_has_aeat_registration boolean := OLD.verifactu_registration_id IS NOT NULL;
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

  v_allowed_keys := ARRAY[
    'updated_at',
    'status',
    'is_valid',
    'verifactu_pending',
    'verifactu_retry_count',
    'verifactu_error_permanent',
    'verifactu_error_message'
  ];

  IF NOT v_has_aeat_registration THEN
    -- Issued or locally sealed, but not yet accepted by AEAT: allow completing
    -- registration metadata without reopening fiscal invoice contents.
    v_allowed_keys := v_allowed_keys || ARRAY[
      'invoice_hash',
      'previous_invoice_hash',
      'verifactu_hash',
      'verifactu_qr',
      'verifactu_timestamp',
      'verifactu_registration_id'
    ];
  END IF;

  IF (to_jsonb(NEW) - v_allowed_keys) IS DISTINCT FROM (to_jsonb(OLD) - v_allowed_keys) THEN
    RAISE EXCEPTION 'No se pueden modificar los datos fiscales de una factura emitida o registrada';
  END IF;

  RETURN NEW;
END;
$$;
