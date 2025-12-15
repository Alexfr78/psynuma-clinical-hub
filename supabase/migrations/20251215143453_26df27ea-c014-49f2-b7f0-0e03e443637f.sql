-- Add portal configuration fields to centers
ALTER TABLE centers ADD COLUMN IF NOT EXISTS portal_slug TEXT UNIQUE;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT false;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS portal_require_approval BOOLEAN DEFAULT true;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS portal_allow_professional_selection BOOLEAN DEFAULT false;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS portal_default_professional_id UUID REFERENCES profiles(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_centers_portal_slug ON centers(portal_slug) WHERE portal_slug IS NOT NULL;

-- Create patient_magic_links table for authentication
CREATE TABLE IF NOT EXISTS patient_magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token ON patient_magic_links(token);
CREATE INDEX IF NOT EXISTS idx_magic_links_email_center ON patient_magic_links(email, center_id);

-- Enable RLS
ALTER TABLE patient_magic_links ENABLE ROW LEVEL SECURITY;

-- Public policies for patient_magic_links
CREATE POLICY "Public can insert magic links"
ON patient_magic_links FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can read magic links by token"
ON patient_magic_links FOR SELECT
USING (token IS NOT NULL);

CREATE POLICY "Public can update magic links by token"
ON patient_magic_links FOR UPDATE
USING (token IS NOT NULL)
WITH CHECK (token IS NOT NULL);

-- Add new session status for pending_approval
ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'pending_approval';

-- Public policy for centers - read by slug (only public fields)
CREATE POLICY "Public read center by slug"
ON centers FOR SELECT
USING (portal_slug IS NOT NULL AND portal_enabled = true);

-- Public policy for profiles - read active professionals by center
CREATE POLICY "Public read professionals for portal"
ON profiles FOR SELECT
USING (
  is_active = true AND
  center_id IN (
    SELECT id FROM centers WHERE portal_enabled = true
  )
);

-- Public policy for session_types - read by center (portal enabled)
CREATE POLICY "Public read session types for portal"
ON session_types FOR SELECT
USING (
  is_active = true AND
  center_id IN (
    SELECT id FROM centers WHERE portal_enabled = true
  )
);

-- Public policy for availability - read for portal
CREATE POLICY "Public read availability for portal"
ON availability FOR SELECT
USING (
  professional_id IN (
    SELECT id FROM profiles WHERE is_active = true AND center_id IN (
      SELECT id FROM centers WHERE portal_enabled = true
    )
  )
);

-- Public policy for sessions - read own by patient_id (via magic link validation)
CREATE POLICY "Portal patients can read own sessions"
ON sessions FOR SELECT
USING (
  patient_id IN (
    SELECT patient_id FROM patient_magic_links 
    WHERE used_at IS NOT NULL 
    AND expires_at > now() - interval '1 hour'
  )
);

-- Public policy for sessions - insert from portal
CREATE POLICY "Portal can create sessions"
ON sessions FOR INSERT
WITH CHECK (
  patient_id IN (
    SELECT patient_id FROM patient_magic_links 
    WHERE used_at IS NOT NULL
  )
);

-- Public policy for patients - insert for registration
CREATE POLICY "Portal can register patients"
ON patients FOR INSERT
WITH CHECK (
  center_id IN (
    SELECT id FROM centers WHERE portal_enabled = true
  )
);

-- Public policy for patients - read own
CREATE POLICY "Portal patients can read own data"
ON patients FOR SELECT
USING (
  id IN (
    SELECT patient_id FROM patient_magic_links 
    WHERE used_at IS NOT NULL
  )
);

-- Public policy for location_schedules for portal
CREATE POLICY "Public read location schedules for portal"
ON location_schedules FOR SELECT
USING (
  location_id IN (
    SELECT id FROM center_locations WHERE center_id IN (
      SELECT id FROM centers WHERE portal_enabled = true
    )
  )
);