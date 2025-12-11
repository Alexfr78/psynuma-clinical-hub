-- Add series_id column to invoices table to track which series the invoice belongs to
ALTER TABLE public.invoices ADD COLUMN series_id uuid REFERENCES public.invoice_series(id);