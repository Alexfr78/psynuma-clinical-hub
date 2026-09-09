-- Create billable_events table to decouple sessions from invoices
-- This allows multiple invoices (original + rectificativas) per economic event
CREATE TABLE public.billable_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  concept TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  billing_status TEXT NOT NULL DEFAULT 'pending' CHECK (billing_status IN ('pending', 'settled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add billable_event_id to invoice_items (keep session_id for backward compatibility during migration)
ALTER TABLE public.invoice_items 
ADD COLUMN billable_event_id UUID REFERENCES billable_events(id) ON DELETE SET NULL;

-- Add is_valid to invoices to track which invoice is the current valid one
ALTER TABLE public.invoices 
ADD COLUMN is_valid BOOLEAN NOT NULL DEFAULT true;

-- Enable RLS on billable_events
ALTER TABLE public.billable_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for billable_events
CREATE POLICY "View billable events in center"
ON public.billable_events
FOR SELECT
USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage billable events in center"
ON public.billable_events
FOR ALL
USING (
  center_id = get_user_center_id(auth.uid()) 
  AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
);

-- Create index for performance
CREATE INDEX idx_billable_events_session ON public.billable_events(session_id);
CREATE INDEX idx_billable_events_patient ON public.billable_events(patient_id);
CREATE INDEX idx_billable_events_status ON public.billable_events(billing_status);
CREATE INDEX idx_invoice_items_billable_event ON public.invoice_items(billable_event_id);

-- Migrate existing data: create billable_events for sessions that have invoice_items
INSERT INTO public.billable_events (center_id, session_id, patient_id, concept, amount, billing_status, created_at)
SELECT DISTINCT
  s.center_id,
  s.id as session_id,
  s.patient_id,
  COALESCE(s.session_type, 'Sesión') as concept,
  s.price as amount,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM invoices inv 
      JOIN invoice_items ii ON ii.invoice_id = inv.id 
      WHERE ii.session_id = s.id AND inv.status = 'paid'
    ) THEN 'settled'
    ELSE 'pending'
  END as billing_status,
  s.created_at
FROM sessions s
WHERE EXISTS (
  SELECT 1 FROM invoice_items ii WHERE ii.session_id = s.id
);

-- Link existing invoice_items to their billable_events
UPDATE public.invoice_items ii
SET billable_event_id = be.id
FROM public.billable_events be
WHERE ii.session_id = be.session_id
AND ii.session_id IS NOT NULL;

-- Mark invoices that have been rectified as is_valid = false
UPDATE public.invoices inv
SET is_valid = false
WHERE EXISTS (
  SELECT 1 FROM invoices rect 
  WHERE rect.rectified_invoice_id = inv.id
);

-- Trigger to update updated_at
CREATE TRIGGER update_billable_events_updated_at
BEFORE UPDATE ON public.billable_events
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();