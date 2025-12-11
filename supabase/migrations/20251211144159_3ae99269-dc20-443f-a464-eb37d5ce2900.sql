-- ====================================================
-- FASE 1: Tabla verifactu_events para registro de auditoría
-- ====================================================
CREATE TABLE public.verifactu_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('alta', 'anulacion', 'consulta', 'error', 'reintento')),
  aeat_csv text,
  aeat_response_code text,
  aeat_response_message text,
  aeat_response_xml text,
  xml_sent text,
  environment text CHECK (environment IN ('test', 'production')),
  http_status integer,
  error_details text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Índices para búsqueda rápida
CREATE INDEX idx_verifactu_events_invoice_id ON verifactu_events(invoice_id);
CREATE INDEX idx_verifactu_events_center_id ON verifactu_events(center_id);
CREATE INDEX idx_verifactu_events_event_type ON verifactu_events(event_type);
CREATE INDEX idx_verifactu_events_created_at ON verifactu_events(created_at);

-- RLS para verifactu_events
ALTER TABLE public.verifactu_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View verifactu events in center"
ON public.verifactu_events
FOR SELECT
USING (center_id = get_user_center_id(auth.uid()) AND is_admin(auth.uid()));

CREATE POLICY "Service role can manage verifactu events"
ON public.verifactu_events
FOR ALL
USING (true)
WITH CHECK (true);

-- ====================================================
-- FASE 2: Campos para facturas rectificativas
-- ====================================================
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS rectified_invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS rectification_type text CHECK (rectification_type IN ('substitution', 'differences'));

CREATE INDEX idx_invoices_rectified_invoice_id ON invoices(rectified_invoice_id);

-- ====================================================
-- FASE 3: Trigger para bloquear facturas firmadas
-- ====================================================
CREATE OR REPLACE FUNCTION public.prevent_signed_invoice_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Aplicar trigger
DROP TRIGGER IF EXISTS prevent_signed_invoice_modification_trigger ON invoices;
CREATE TRIGGER prevent_signed_invoice_modification_trigger
BEFORE UPDATE ON invoices
FOR EACH ROW
EXECUTE FUNCTION prevent_signed_invoice_modification();

-- ====================================================
-- FASE 4: Campo para reintentos pendientes
-- ====================================================
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS verifactu_pending boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS verifactu_retry_count integer DEFAULT 0;