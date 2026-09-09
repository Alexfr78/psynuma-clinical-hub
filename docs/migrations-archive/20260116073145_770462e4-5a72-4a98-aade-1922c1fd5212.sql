-- Añadir columna para número de Bizum en centers
ALTER TABLE centers ADD COLUMN IF NOT EXISTS bizum_phone TEXT;

-- Añadir columnas a debts para tracking de checkout y acceso público
ALTER TABLE debts ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS stripe_payment_status TEXT;
ALTER TABLE debts ADD COLUMN IF NOT EXISTS access_token TEXT DEFAULT gen_random_uuid()::text;

-- Crear índice único para access_token
CREATE UNIQUE INDEX IF NOT EXISTS debts_access_token_idx ON debts(access_token);

-- Generar access_token para deudas existentes que no lo tengan
UPDATE debts SET access_token = gen_random_uuid()::text WHERE access_token IS NULL;