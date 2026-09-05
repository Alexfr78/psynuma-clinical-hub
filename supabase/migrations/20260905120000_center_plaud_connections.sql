-- Plaud integration (recordings/transcripts source), connected per-center,
-- following the exact same shape as center_drive_connections: tokens live
-- only in service-role-only tables, encrypted with the shared
-- CERTIFICATE_ENCRYPTION_KEY helper (_shared/crypto.ts). Client code never
-- reads these tables directly; status is surfaced via the plaud-connection
-- edge function, which returns only non-sensitive fields.
--
-- IMPORTANT: `enabled` defaults to false and MUST stay false until the
-- center owner flips it on by hand in Configuración → Conexiones Externas.
-- Connecting (OAuth) only stores credentials; it does not turn ingestion on.
-- Every consumer of getValidPlaudAccessToken() (see _shared/plaud.ts) must
-- treat `enabled = false` as "nothing to do here", not just "not yet
-- connected" — no polling/ingestion job may process a disabled connection.

-- Short-lived PKCE state, bridging the "start authorization" request and the
-- OAuth redirect callback (both stateless edge functions). One row per
-- in-flight authorization attempt; deleted after the callback consumes it,
-- and opportunistically swept of anything past its expiry.
CREATE TABLE IF NOT EXISTS public.plaud_oauth_states (
  state TEXT PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES public.centers(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL, -- not secret (see plaud-oauth-start comment); plaintext is fine here
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

-- Main connection/credentials table.
CREATE TABLE IF NOT EXISTS public.center_plaud_connections (
  center_id UUID PRIMARY KEY REFERENCES public.centers(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Display-only label fetched from get_current_user right after connecting
  -- (e.g. the Plaud account's own display name/email) — never the content
  -- of any recording or note.
  plaud_account_label TEXT,

  -- OAuth client used for this connection. Plaud has no manual "create an
  -- app" console for third parties (only RFC 7591 dynamic registration, see
  -- plaud-oauth-start); client_id is not a confidential value, but is still
  -- stored encrypted for hygiene, consistent with the rest of this table.
  -- plaud_client_secret_encrypted stays NULL in the common case (public
  -- client, token_endpoint_auth_method=none) and is only populated if a
  -- future registration ever comes back with a secret.
  plaud_client_id_encrypted TEXT,
  plaud_client_secret_encrypted TEXT,

  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scope TEXT,

  -- Master ingestion switch. MUST default to false — see file header.
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
