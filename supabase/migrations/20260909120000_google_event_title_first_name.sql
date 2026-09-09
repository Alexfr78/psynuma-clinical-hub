-- El título de los eventos de Google Calendar pasa a ser solo el nombre de pila.
-- Nuevo token {nombre} (nombre de pila) frente a {paciente} (nombre completo).

ALTER TABLE public.professional_integrations
  ALTER COLUMN google_event_title_format SET DEFAULT '{nombre}';

-- Solo se migran quienes seguían con el formato por defecto anterior;
-- los formatos personalizados se respetan.
UPDATE public.professional_integrations
SET google_event_title_format = '{nombre}'
WHERE google_event_title_format IS NULL
   OR btrim(google_event_title_format) = '{tipo} - {paciente}';
