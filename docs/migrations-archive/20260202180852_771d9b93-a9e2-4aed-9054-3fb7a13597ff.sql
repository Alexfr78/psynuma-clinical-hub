-- Add portal_agenda_closed to centers table
ALTER TABLE public.centers
ADD COLUMN IF NOT EXISTS portal_agenda_closed boolean DEFAULT false;

-- Add is_first_consultation to session_types table
ALTER TABLE public.session_types
ADD COLUMN IF NOT EXISTS is_first_consultation boolean DEFAULT false;

-- Create portal_intake_requests table for waitlist and referrals
CREATE TABLE public.portal_intake_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id uuid NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('waitlist', 'referral')),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  phone text,
  modality text CHECK (modality IN ('online', 'presencial')),
  city text,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'converted', 'cancelled')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.portal_intake_requests IS 'Stores waitlist and referral requests from public booking when agenda is closed';

-- Enable RLS
ALTER TABLE public.portal_intake_requests ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX idx_portal_intake_requests_center_id ON public.portal_intake_requests(center_id);
CREATE INDEX idx_portal_intake_requests_status ON public.portal_intake_requests(status);

-- RLS Policies
-- Authenticated users from the same center can view requests
CREATE POLICY "Users can view intake requests from their center"
ON public.portal_intake_requests
FOR SELECT
TO authenticated
USING (
  center_id IN (
    SELECT center_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Authenticated users from the same center can insert (for admin purposes)
CREATE POLICY "Users can insert intake requests for their center"
ON public.portal_intake_requests
FOR INSERT
TO authenticated
WITH CHECK (
  center_id IN (
    SELECT center_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Authenticated users from the same center can update requests
CREATE POLICY "Users can update intake requests from their center"
ON public.portal_intake_requests
FOR UPDATE
TO authenticated
USING (
  center_id IN (
    SELECT center_id FROM public.profiles WHERE id = auth.uid()
  )
);

-- Allow anonymous inserts for public submissions (edge function will handle this with service role)
CREATE POLICY "Allow anon insert for public submissions"
ON public.portal_intake_requests
FOR INSERT
TO anon
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_portal_intake_requests_updated_at
BEFORE UPDATE ON public.portal_intake_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();