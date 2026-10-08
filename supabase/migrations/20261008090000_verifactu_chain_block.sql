ALTER TABLE public.verifactu_chain_status
  ADD COLUMN IF NOT EXISTS blocked_reason text,
  ADD COLUMN IF NOT EXISTS blocked_invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

COMMENT ON COLUMN public.verifactu_chain_status.blocked_reason IS
  'Motivo que impide registrar nuevos movimientos hasta conciliar la cadena con la AEAT.';
COMMENT ON COLUMN public.verifactu_chain_status.blocked_invoice_id IS
  'Factura que originó el bloqueo de la cadena; se conserva como referencia para la conciliación.';
COMMENT ON COLUMN public.verifactu_chain_status.blocked_at IS
  'Fecha y hora en que se bloqueó la cadena Verifactu.';
