-- Repair only classification metadata that can be proven from the referenced
-- original series. Never alter canonical Verifactu records, hashes or AEAT CSVs.

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE TEMP TABLE rectification_type_repairs (
  rectifying_number text PRIMARY KEY,
  original_number text NOT NULL,
  original_invoice_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO rectification_type_repairs (
  rectifying_number,
  original_number,
  original_invoice_type
) VALUES
  ('RP260001', 'SP260004', 'simplified'),
  ('RP260002', 'SP260022', 'simplified'),
  ('RS260002', 'SF260053', 'complete'),
  ('RP260003', 'SP260033', 'simplified'),
  ('RS260003', 'SF260087', 'complete');

-- Correct the series metadata used by the known rectifying and original
-- invoices. Matching is center-scoped and requires an unambiguous number.
WITH unique_invoices AS (
  SELECT center_id, invoice_number, min(id::text)::uuid AS id, min(series_id::text)::uuid AS series_id
  FROM public.invoices
  GROUP BY center_id, invoice_number
  HAVING count(*) = 1
),
resolved_pairs AS (
  SELECT
    rectifying.id AS rectifying_id,
    rectifying.series_id AS rectifying_series_id,
    original.id AS original_id,
    original.series_id AS original_series_id,
    repair.original_invoice_type
  FROM rectification_type_repairs AS repair
  JOIN unique_invoices AS rectifying
    ON rectifying.invoice_number = repair.rectifying_number
  JOIN unique_invoices AS original
    ON original.invoice_number = repair.original_number
   AND original.center_id = rectifying.center_id
  JOIN public.invoices AS rectifying_invoice
    ON rectifying_invoice.id = rectifying.id
   AND rectifying_invoice.rectified_invoice_id = original.id
),
series_repairs AS (
  SELECT rectifying_series_id AS series_id, original_invoice_type AS invoice_type
  FROM resolved_pairs
  UNION
  SELECT original_series_id AS series_id, original_invoice_type AS invoice_type
  FROM resolved_pairs
)
UPDATE public.invoice_series AS series
SET invoice_type = repair.invoice_type,
    updated_at = now()
FROM series_repairs AS repair
WHERE series.id = repair.series_id
  AND series.invoice_type IS DISTINCT FROM repair.invoice_type;

-- Only unsealed invoices may have their persisted fiscal classification
-- repaired in place. Sealed/registered invoices remain immutable because their
-- hashes and AEAT submissions reflect the original payload.
WITH unique_invoices AS (
  SELECT center_id, invoice_number, min(id::text)::uuid AS id
  FROM public.invoices
  GROUP BY center_id, invoice_number
  HAVING count(*) = 1
),
targets AS (
  SELECT rectifying.id, repair.original_invoice_type
  FROM rectification_type_repairs AS repair
  JOIN unique_invoices AS rectifying
    ON rectifying.invoice_number = repair.rectifying_number
  JOIN unique_invoices AS original
    ON original.invoice_number = repair.original_number
   AND original.center_id = rectifying.center_id
  JOIN public.invoices AS rectifying_invoice
    ON rectifying_invoice.id = rectifying.id
   AND rectifying_invoice.rectified_invoice_id = original.id
)
UPDATE public.invoices AS invoice
SET verifactu_invoice_type = CASE
      WHEN target.original_invoice_type = 'simplified' THEN 'R5'
      WHEN invoice.rectification_reason_code IN ('R1', 'R2', 'R3', 'R4')
        THEN invoice.rectification_reason_code
      ELSE NULL
    END,
    rectification_reason_code = CASE
      WHEN target.original_invoice_type = 'simplified' THEN 'R5'
      WHEN invoice.rectification_reason_code IN ('R1', 'R2', 'R3', 'R4')
        THEN invoice.rectification_reason_code
      ELSE NULL
    END,
    updated_at = now()
FROM targets AS target
WHERE invoice.id = target.id
  AND invoice.verifactu_hash IS NULL
  AND invoice.invoice_hash IS NULL
  AND invoice.verifactu_registration_id IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.verifactu_records AS record
    WHERE record.invoice_id = invoice.id
  );

-- A stored anulacion event is sufficient evidence for the cancellation date,
-- but not for a reason, hash, CSV or AEAT acceptance status.
UPDATE public.invoices AS invoice
SET cancellation_date = event.first_anulacion_at::date,
    updated_at = now()
FROM (
  SELECT invoice_id, min(created_at) AS first_anulacion_at
  FROM public.verifactu_events
  WHERE event_type = 'anulacion'
    AND invoice_id IS NOT NULL
  GROUP BY invoice_id
) AS event
WHERE invoice.id = event.invoice_id
  AND invoice.status = 'cancelled'
  AND invoice.cancellation_date IS NULL;
