-- Formato de factura por centro.
--
-- Cada centro elige el modelo con el que se generan sus PDF de factura. Los
-- centros existentes (y los nuevos) se quedan en 'standard', el formato que
-- había hasta ahora; 'formal' es el modelo nuevo de profesional colegiado
-- (cabecera con datos del emisor, tabla con bordes, firma y forma de pago).
--
--   invoice_template            'standard' | 'formal'.
--   invoice_license_line        línea de colegiación tal cual se imprime bajo
--                               la dirección (p. ej. "NÚMERO DE COLEGIADA: M-1").
--   invoice_signature_path      ruta de la firma en el bucket privado
--                               invoice-documents ({center_id}/branding/...).
--                               Nunca en invoice-logos, que es público.
--   invoice_tax_exemption_note  nota legal que acompaña a "EXENTO*" cuando la
--                               factura no lleva IVA.
--
-- Los PDF ya generados no cambian: generate-invoice-pdf reutiliza el archivo
-- guardado, así que el modelo solo afecta a las facturas que se generen a
-- partir del cambio.

ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS invoice_template text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS invoice_license_line text,
  ADD COLUMN IF NOT EXISTS invoice_signature_path text,
  ADD COLUMN IF NOT EXISTS invoice_tax_exemption_note text;

ALTER TABLE public.centers
  DROP CONSTRAINT IF EXISTS centers_invoice_template_check;
ALTER TABLE public.centers
  ADD CONSTRAINT centers_invoice_template_check
  CHECK (invoice_template IN ('standard', 'formal'));

-- La firma solo puede estar en una de las dos rutas fijas del propio centro.
-- generate-invoice-pdf la descarga con la service role: una ruta libre (con
-- "..") serviría para leer archivos de otros centros o de otros buckets.
ALTER TABLE public.centers
  DROP CONSTRAINT IF EXISTS centers_invoice_signature_path_check;
ALTER TABLE public.centers
  ADD CONSTRAINT centers_invoice_signature_path_check
  CHECK (
    invoice_signature_path IS NULL
    OR invoice_signature_path IN (
      id::text || '/branding/invoice-signature.png',
      id::text || '/branding/invoice-signature.jpg'
    )
  );
