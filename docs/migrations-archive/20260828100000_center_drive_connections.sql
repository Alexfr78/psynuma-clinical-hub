-- Google Drive integration, connected per-center (not per-professional like
-- Calendar/Meet), for storing generated documents (starting with invoices)
-- outside of Supabase Storage as an external backup / long-term archive.

-- Tokens are stored only for service_role. Client code never reads this
-- table directly; connection status is surfaced via a dedicated edge
-- function that returns only non-sensitive fields (same approach as
-- public_short_links / email_* tables in this project).
CREATE TABLE IF NOT EXISTS public.center_drive_connections (
  center_id UUID PRIMARY KEY REFERENCES public.centers(id) ON DELETE CASCADE,
  connected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  google_account_email TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  drive_root_folder_id TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  needs_reconnect BOOLEAN NOT NULL DEFAULT false,
  last_upload_at TIMESTAMPTZ,
  last_upload_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_center_drive_connections_updated_at
  BEFORE UPDATE ON public.center_drive_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.center_drive_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.center_drive_connections FROM anon, authenticated;
GRANT ALL ON TABLE public.center_drive_connections TO service_role;

COMMENT ON TABLE public.center_drive_connections IS
  'Service-role only. RLS enabled with no policies = default deny for anon/authenticated. Client reads connection status via an edge function, never this table directly.';

-- OAuth client credentials for the Google Drive app (separate from the
-- existing oauth_google_client_id/oauth_google_credentials used by
-- Calendar/Meet, since Drive is a distinct consent flow with a narrower
-- scope: https://www.googleapis.com/auth/drive.file).
ALTER TABLE public.centers
  ADD COLUMN IF NOT EXISTS oauth_google_drive_client_id TEXT,
  ADD COLUMN IF NOT EXISTS oauth_google_drive_credentials TEXT;

REVOKE SELECT (oauth_google_drive_credentials) ON public.centers FROM authenticated, anon;

-- Storage bucket for generated invoice PDFs (the Supabase-side original;
-- Drive is the external copy uploaded from here).
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-documents', 'invoice-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Professionals access invoice documents" ON storage.objects
  FOR ALL USING (
    bucket_id = 'invoice-documents'
    AND (public.is_admin(auth.uid()) OR public.is_professional(auth.uid()))
  );

-- Track PDF generation and Drive upload state on invoices.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_url TEXT;
