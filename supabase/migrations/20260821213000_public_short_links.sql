-- Internal short links for patient-facing notifications.
-- The table intentionally has no anonymous policies. Edge Functions use the
-- service role and expose only the resolved public route.
CREATE TABLE IF NOT EXISTS public.public_short_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('session', 'session_payment', 'debt', 'debt_bono')),
  target_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_token)
);

CREATE INDEX IF NOT EXISTS public_short_links_active_lookup_idx
  ON public.public_short_links(code)
  WHERE revoked_at IS NULL;

ALTER TABLE public.public_short_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_short_links FROM anon, authenticated;
GRANT ALL ON TABLE public.public_short_links TO service_role;
