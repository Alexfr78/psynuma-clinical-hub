ALTER TABLE public.professional_integrations
  ALTER COLUMN google_event_title_format SET DEFAULT '{nombre}';

UPDATE public.professional_integrations
SET google_event_title_format = '{nombre}'
WHERE google_event_title_format IS NULL
   OR btrim(google_event_title_format) = '{tipo} - {paciente}';