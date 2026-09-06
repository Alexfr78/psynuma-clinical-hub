CREATE TABLE IF NOT EXISTS public.plaud_oauth_states (
  state TEXT PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  code_verifier_encrypted TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

ALTER TABLE public.plaud_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.plaud_oauth_states FROM anon, authenticated;
GRANT ALL ON TABLE public.plaud_oauth_states TO service_role;

COMMENT ON TABLE public.plaud_oauth_states IS
  'Service-role only. Ephemeral PKCE bridge between plaud-oauth-start and plaud-oauth-callback. RLS enabled with no policies = default deny.';

CREATE TABLE IF NOT EXISTS public.center_plaud_connections (
  center_id UUID PRIMARY KEY REFERENCES public.centers(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  plaud_account_label TEXT,
  plaud_client_id_encrypted TEXT,
  plaud_client_secret_encrypted TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  needs_reconnect BOOLEAN NOT NULL DEFAULT false,
  last_refresh_at TIMESTAMPTZ,
  last_refresh_result TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_center_plaud_connections_updated_at
  BEFORE UPDATE ON public.center_plaud_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.center_plaud_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.center_plaud_connections FROM anon, authenticated;
GRANT ALL ON TABLE public.center_plaud_connections TO service_role;

COMMENT ON TABLE public.center_plaud_connections IS
  'Service-role only. RLS enabled with no policies = default deny for anon/authenticated. Client reads connection status via the plaud-connection edge function, never this table directly. enabled defaults to false and gates all ingestion (see getValidPlaudAccessToken in _shared/plaud.ts).';