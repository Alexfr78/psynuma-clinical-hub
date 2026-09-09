-- Add session_id column to payments table to allow direct session payments
ALTER TABLE public.payments
ADD COLUMN session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_payments_session_id ON public.payments(session_id);