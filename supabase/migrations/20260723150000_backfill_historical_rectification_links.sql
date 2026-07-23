-- Resolve stable original invoice IDs for known historical rectificativas.
-- Matching is scoped to the same center and only fills missing links.
WITH rectification_pairs(rectifying_number, original_number) AS (
  VALUES
    ('RP260001', 'SP260004'),
    ('RP260002', 'SP260022'),
    ('RS260002', 'SF260053'),
    ('RP260003', 'SP260033'),
    ('RS260003', 'SF260087')
)
UPDATE public.invoices AS rectifying
SET rectified_invoice_id = original.id,
    updated_at = now()
FROM rectification_pairs AS pair
JOIN (
  SELECT center_id, invoice_number, min(id::text)::uuid AS id
  FROM public.invoices
  GROUP BY center_id, invoice_number
  HAVING count(*) = 1
) AS original
  ON original.invoice_number = pair.original_number
WHERE rectifying.invoice_number = pair.rectifying_number
  AND rectifying.center_id = original.center_id
  AND rectifying.rectified_invoice_id IS NULL;
