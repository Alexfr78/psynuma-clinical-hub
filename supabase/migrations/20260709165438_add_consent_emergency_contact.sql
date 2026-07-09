-- Let a consent template require an emergency contact field (same pattern as
-- requires_guardian_signature), and let each consent carry an editable
-- emergency contact snapshot: pre-filled from the patient's file when the
-- consent is created, and updated by the patient while signing.

ALTER TABLE public.consent_templates
  ADD COLUMN requires_emergency_contact boolean NOT NULL DEFAULT false;

ALTER TABLE public.consents
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text;
