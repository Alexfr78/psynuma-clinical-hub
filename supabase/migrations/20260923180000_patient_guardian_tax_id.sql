-- DNI/NIE del tutor legal de un paciente menor. Lo exigen los consentimientos
-- que piden DNI cuando el paciente es menor (variable `{dni_tutor}`); si falta en
-- la ficha, se pide al firmar y `update-consent-identity` lo guarda aquí.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS guardian_tax_id text;

COMMENT ON COLUMN public.patients.guardian_tax_id IS
  'DNI/NIE del tutor legal (pacientes menores). Se completa desde la ficha o al firmar un consentimiento.';
