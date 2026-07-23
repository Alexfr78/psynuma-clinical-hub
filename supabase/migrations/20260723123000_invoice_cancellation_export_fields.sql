-- Persist cancellation metadata so fiscal exports never have to reconstruct or invent it.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS cancellation_date date,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

UPDATE public.invoices AS invoice
SET cancellation_date = (
  SELECT min(record.created_at)::date
  FROM public.verifactu_records AS record
  WHERE record.invoice_id = invoice.id
    AND record.record_type = 'anulacion'
)
WHERE invoice.status = 'cancelled'
  AND invoice.cancellation_date IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.verifactu_records AS record
    WHERE record.invoice_id = invoice.id
      AND record.record_type = 'anulacion'
  );

COMMENT ON COLUMN public.invoices.cancellation_date IS
  'Fiscal cancellation date. Backfilled from the canonical Verifactu cancellation record when available.';
COMMENT ON COLUMN public.invoices.cancellation_reason IS
  'User-provided fiscal cancellation reason. Null for historical cancellations where it was not captured.';
