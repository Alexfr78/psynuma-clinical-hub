-- Fix: drop the policy that was never actually removed due to name mismatch
DROP POLICY IF EXISTS "Public update by token" ON public.sessions;

-- Verify the read policy was correctly dropped (this is idempotent/safe)
DROP POLICY IF EXISTS "Public read access by token" ON public.sessions;