
CREATE OR REPLACE FUNCTION public.prevent_signed_invoice_modification()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Si la factura tiene hash (está firmada), solo permitir cambios específicos
  IF OLD.invoice_hash IS NOT NULL THEN
    -- Permitir solo cambio de estado a cancelled (anulación)
    -- y actualización de campos Verifactu
    IF (
      NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cancelled'
    ) OR (
      -- Permitir actualizar campos verifactu durante el proceso de firma
      NEW.invoice_hash IS DISTINCT FROM OLD.invoice_hash OR
      NEW.verifactu_hash IS DISTINCT FROM OLD.verifactu_hash OR
      NEW.verifactu_qr IS DISTINCT FROM OLD.verifactu_qr OR
      NEW.verifactu_timestamp IS DISTINCT FROM OLD.verifactu_timestamp OR
      NEW.verifactu_registration_id IS DISTINCT FROM OLD.verifactu_registration_id OR
      NEW.previous_invoice_hash IS DISTINCT FROM OLD.previous_invoice_hash
    ) THEN
      -- Estos cambios están permitidos
      RETURN NEW;
    END IF;

    -- Permitir reasignación de patient_id (merge) si no cambian campos financieros
    IF (
      NEW.patient_id IS DISTINCT FROM OLD.patient_id AND
      NEW.invoice_number IS NOT DISTINCT FROM OLD.invoice_number AND
      NEW.issue_date IS NOT DISTINCT FROM OLD.issue_date AND
      NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal AND
      NEW.tax_amount IS NOT DISTINCT FROM OLD.tax_amount AND
      NEW.total IS NOT DISTINCT FROM OLD.total
    ) THEN
      RETURN NEW;
    END IF;

    -- Verificar que no se modifiquen campos críticos
    IF (
      NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
      NEW.issue_date IS DISTINCT FROM OLD.issue_date OR
      NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
      NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
      NEW.tax_amount IS DISTINCT FROM OLD.tax_amount OR
      NEW.total IS DISTINCT FROM OLD.total
    ) THEN
      RAISE EXCEPTION 'No se puede modificar una factura firmada con Verifactu. Solo se permite anular la factura.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
