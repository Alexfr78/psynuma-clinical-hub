
-- Table for referral partner registration requests
CREATE TABLE public.referral_partner_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  surname TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  description TEXT,
  public_name TEXT,
  modality TEXT[] NOT NULL DEFAULT '{}',
  provinces TEXT[],
  cities TEXT[],
  specialties TEXT[],
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  privacy_accepted BOOLEAN NOT NULL DEFAULT false,
  privacy_accepted_at TIMESTAMPTZ,
  privacy_policy_url TEXT,
  handled_by UUID REFERENCES public.profiles(id),
  handled_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.referral_partner_requests ENABLE ROW LEVEL SECURITY;

-- Anon can insert (public registration)
CREATE POLICY "Anyone can submit a referral request"
  ON public.referral_partner_requests
  FOR INSERT
  WITH CHECK (true);

-- Authenticated users of same center can read
CREATE POLICY "Center members can view requests"
  ON public.referral_partner_requests
  FOR SELECT
  USING (
    center_id IN (
      SELECT p.center_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Authenticated users of same center can update (approve/reject)
CREATE POLICY "Center members can update requests"
  ON public.referral_partner_requests
  FOR UPDATE
  USING (
    center_id IN (
      SELECT p.center_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_referral_partner_requests_updated_at
  BEFORE UPDATE ON public.referral_partner_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Public RPC to get active specialties for a center by slug
CREATE OR REPLACE FUNCTION public.get_public_referral_specialties(center_slug TEXT)
RETURNS TABLE(name TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rs.name
  FROM referral_specialties rs
  JOIN centers c ON c.id = rs.center_id
  WHERE c.portal_slug = center_slug
    AND rs.active = true
  ORDER BY rs.priority, rs.name;
$$;
