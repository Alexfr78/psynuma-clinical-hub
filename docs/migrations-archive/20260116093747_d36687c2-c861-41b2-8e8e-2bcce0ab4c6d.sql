-- Add public_domain column to centers table for multi-tenant domain support
ALTER TABLE centers ADD COLUMN IF NOT EXISTS public_domain TEXT;

-- Set default value for existing centers
UPDATE centers SET public_domain = 'psycma.psicologosexual.com' WHERE public_domain IS NULL;