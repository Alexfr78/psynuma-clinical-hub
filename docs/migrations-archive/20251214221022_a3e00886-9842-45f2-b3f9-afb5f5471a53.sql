-- Add Google Calendar format fields to professional_integrations
ALTER TABLE professional_integrations 
ADD COLUMN IF NOT EXISTS google_event_title_format TEXT DEFAULT '{tipo} - {paciente}';

ALTER TABLE professional_integrations 
ADD COLUMN IF NOT EXISTS google_event_description_format TEXT DEFAULT 'Profesional: {profesional}
Tipo: {tipo}
Notas: {notas}';