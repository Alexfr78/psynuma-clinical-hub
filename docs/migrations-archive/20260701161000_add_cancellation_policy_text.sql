ALTER TABLE public.cancellation_policy_versions
  ADD COLUMN IF NOT EXISTS policy_text text;

COMMENT ON COLUMN public.cancellation_policy_versions.policy_text IS
  'Editable cancellation policy text stored with each policy version and used as the signed consent snapshot.';
