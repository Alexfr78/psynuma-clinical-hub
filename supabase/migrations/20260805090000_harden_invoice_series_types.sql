-- Keep complete/simplified invoice series independent and preserve the fiscal
-- document type on every new invoice.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_type text;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_invoice_type_check
  CHECK (invoice_type IS NULL OR invoice_type IN ('simplified', 'complete'));

COMMENT ON COLUMN public.invoices.invoice_type IS
  'Immutable complete/simplified type captured from the selected series. NULL is reserved for legacy invoices.';

-- Backfill only where the historical fiscal type is unambiguous. Unsigned
-- issued legacy invoices deliberately remain NULL and continue using their
-- now-protected series as a compatibility fallback.
UPDATE public.invoices
SET invoice_type = CASE
  WHEN verifactu_invoice_type IN ('F2', 'R5') THEN 'simplified'
  WHEN verifactu_invoice_type IN ('F1', 'F3', 'R1', 'R2', 'R3', 'R4') THEN 'complete'
  ELSE invoice_type
END
WHERE invoice_type IS NULL
  AND verifactu_invoice_type IN ('F1', 'F2', 'F3', 'R1', 'R2', 'R3', 'R4', 'R5');

UPDATE public.invoices AS invoice
SET invoice_type = series.invoice_type
FROM public.invoice_series AS series
WHERE invoice.invoice_type IS NULL
  AND invoice.status = 'draft'
  AND invoice.series_id = series.id;

DROP INDEX IF EXISTS public.idx_invoice_series_default_per_type;

CREATE UNIQUE INDEX idx_invoice_series_default_per_document_type
ON public.invoice_series (center_id, series_type, invoice_type)
WHERE is_default = true AND is_archived = false;

CREATE OR REPLACE FUNCTION public.set_default_invoice_series(p_series_id uuid)
RETURNS SETOF public.invoice_series
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_series public.invoice_series;
BEGIN
  SELECT *
  INTO v_series
  FROM public.invoice_series
  WHERE id = p_series_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serie de facturación no encontrada';
  END IF;

  IF COALESCE(v_series.is_archived, false) THEN
    RAISE EXCEPTION 'No se puede establecer como predeterminada una serie archivada';
  END IF;

  -- Serialize changes for this center to avoid competing defaults.
  PERFORM pg_advisory_xact_lock(hashtext(
    v_series.center_id::text || ':' || v_series.series_type || ':' || v_series.invoice_type
  ));

  PERFORM 1
  FROM public.invoice_series
  WHERE center_id = v_series.center_id
    AND series_type = v_series.series_type
    AND invoice_type = v_series.invoice_type
  FOR UPDATE;

  UPDATE public.invoice_series
  SET is_default = false
  WHERE center_id = v_series.center_id
    AND series_type = v_series.series_type
    AND invoice_type = v_series.invoice_type
    AND is_archived = false
    AND id <> v_series.id;

  UPDATE public.invoice_series
  SET is_default = true
  WHERE id = v_series.id
  RETURNING * INTO v_series;

  RETURN NEXT v_series;
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_invoice_series_document_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_series public.invoice_series;
BEGIN
  IF NEW.series_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.status <> 'draft' THEN
        RAISE EXCEPTION 'Una factura emitida necesita una serie de facturación';
      END IF;
    ELSIF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'Una factura emitida necesita una serie de facturación';
    END IF;
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_series
  FROM public.invoice_series
  WHERE id = NEW.series_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Serie de facturación no encontrada';
  END IF;

  IF v_series.center_id <> NEW.center_id THEN
    RAISE EXCEPTION 'La serie de facturación pertenece a otro centro';
  END IF;

  IF COALESCE(v_series.is_archived, false) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'No se puede usar una serie de facturación archivada';
    ELSIF NEW.series_id IS DISTINCT FROM OLD.series_id
       OR (OLD.status = 'draft' AND NEW.status <> 'draft') THEN
      RAISE EXCEPTION 'No se puede usar una serie de facturación archivada';
    END IF;
  END IF;

  IF NEW.invoice_type IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.invoice_type := v_series.invoice_type;
    ELSIF OLD.status = 'draft' THEN
      NEW.invoice_type := v_series.invoice_type;
    END IF;
  ELSIF NEW.invoice_type <> v_series.invoice_type THEN
    RAISE EXCEPTION 'El tipo de factura (%) no coincide con el tipo de la serie (%)',
      NEW.invoice_type, v_series.invoice_type;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_type IS NOT NULL AND NEW.invoice_type IS DISTINCT FROM OLD.invoice_type THEN
      RAISE EXCEPTION 'El tipo de una factura no se puede modificar después de crearla';
    END IF;

    IF OLD.status <> 'draft' AND NEW.series_id IS DISTINCT FROM OLD.series_id THEN
      RAISE EXCEPTION 'La serie de una factura emitida no se puede modificar';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_invoice_series_document_type_trigger ON public.invoices;
CREATE TRIGGER validate_invoice_series_document_type_trigger
BEFORE INSERT OR UPDATE OF series_id, invoice_type, status ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.validate_invoice_series_document_type();

CREATE OR REPLACE FUNCTION public.protect_used_invoice_series_classification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.invoice_type, NEW.series_type) IS DISTINCT FROM (OLD.invoice_type, OLD.series_type)
     AND EXISTS (
       SELECT 1
       FROM public.invoices
       WHERE series_id = OLD.id
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'No se puede cambiar el tipo de una serie que ya tiene facturas. Archívala y crea una nueva.';
  END IF;

  IF COALESCE(NEW.is_archived, false) AND COALESCE(NEW.is_default, false) THEN
    NEW.is_default := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_used_invoice_series_classification_trigger ON public.invoice_series;
CREATE TRIGGER protect_used_invoice_series_classification_trigger
BEFORE UPDATE OF invoice_type, series_type, is_archived ON public.invoice_series
FOR EACH ROW
EXECUTE FUNCTION public.protect_used_invoice_series_classification();
