
-- Add consent expiration days to centers
ALTER TABLE centers ADD COLUMN IF NOT EXISTS consent_expiration_days integer DEFAULT 7;

-- Create consent status enum
DO $$ BEGIN
  CREATE TYPE consent_status AS ENUM ('pending', 'signed', 'revoked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Table: consent_templates
CREATE TABLE IF NOT EXISTS consent_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name text NOT NULL,
  content_html text NOT NULL,
  requires_guardian_signature boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: consents
CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES consent_templates(id),
  professional_id uuid NOT NULL REFERENCES profiles(id),
  status consent_status DEFAULT 'pending',
  access_token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  content_snapshot text NOT NULL,
  requires_guardian boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  signed_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  signed_pdf_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Table: consent_signatures
CREATE TABLE IF NOT EXISTS consent_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_role text NOT NULL CHECK (signer_role IN ('patient', 'guardian')),
  signature_order integer NOT NULL,
  signature_data text NOT NULL,
  ip_address text,
  user_agent text,
  signed_at timestamptz DEFAULT now()
);

-- Triggers for updated_at
CREATE TRIGGER update_consent_templates_updated_at
  BEFORE UPDATE ON consent_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_consents_updated_at
  BEFORE UPDATE ON consents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE consent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_signatures ENABLE ROW LEVEL SECURITY;

-- RLS Policies for consent_templates
CREATE POLICY "View templates in center" ON consent_templates
  FOR SELECT USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage templates in center" ON consent_templates
  FOR ALL USING (
    center_id = get_user_center_id(auth.uid()) 
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

-- RLS Policies for consents (professionals)
CREATE POLICY "View consents in center" ON consents
  FOR SELECT USING (center_id = get_user_center_id(auth.uid()));

CREATE POLICY "Manage consents in center" ON consents
  FOR ALL USING (
    center_id = get_user_center_id(auth.uid()) 
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );

-- RLS Policies for consents (public access via token)
CREATE POLICY "Public read consent by token" ON consents
  FOR SELECT USING (access_token IS NOT NULL);

CREATE POLICY "Public update consent by token" ON consents
  FOR UPDATE USING (access_token IS NOT NULL)
  WITH CHECK (access_token IS NOT NULL);

-- RLS Policies for consent_signatures
CREATE POLICY "View signatures in center" ON consent_signatures
  FOR SELECT USING (
    consent_id IN (SELECT id FROM consents WHERE center_id = get_user_center_id(auth.uid()))
  );

CREATE POLICY "Insert signature by token" ON consent_signatures
  FOR INSERT WITH CHECK (
    consent_id IN (SELECT id FROM consents WHERE access_token IS NOT NULL)
  );

-- Storage bucket for consent documents
INSERT INTO storage.buckets (id, name, public) 
VALUES ('consent-documents', 'consent-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "Professionals access consent documents" ON storage.objects
  FOR ALL USING (
    bucket_id = 'consent-documents' 
    AND (is_admin(auth.uid()) OR is_professional(auth.uid()))
  );
