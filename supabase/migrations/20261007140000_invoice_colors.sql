-- Colores del documento de factura por centro.
--
-- NULL = los colores de siempre de cada modelo, así que los centros actuales
-- no ven ningún cambio. Qué pinta cada color depende del modelo (lo resuelve
-- generate-invoice-pdf):
--   standard  principal: nombre del centro, número, línea y total.
--             secundario: datos del centro, fechas y etiquetas.
--   formal    principal: banda del título.
--             secundario: barras de cabecera y pie.

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS invoice_primary_color text,
  ADD COLUMN IF NOT EXISTS invoice_secondary_color text;

ALTER TABLE public.centers
  DROP CONSTRAINT IF EXISTS centers_invoice_primary_color_check;
ALTER TABLE public.centers
  ADD CONSTRAINT centers_invoice_primary_color_check
  CHECK (invoice_primary_color IS NULL OR invoice_primary_color ~ '^#[0-9a-f]{6}$');

ALTER TABLE public.centers
  DROP CONSTRAINT IF EXISTS centers_invoice_secondary_color_check;
ALTER TABLE public.centers
  ADD CONSTRAINT centers_invoice_secondary_color_check
  CHECK (invoice_secondary_color IS NULL OR invoice_secondary_color ~ '^#[0-9a-f]{6}$');
