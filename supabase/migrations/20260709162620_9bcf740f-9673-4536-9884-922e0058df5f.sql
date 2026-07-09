ALTER TABLE public.consent_templates ADD COLUMN IF NOT EXISTS requires_emergency_contact boolean NOT NULL DEFAULT false;
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS emergency_contact_name text;
ALTER TABLE public.consents ADD COLUMN IF NOT EXISTS emergency_contact_phone text;