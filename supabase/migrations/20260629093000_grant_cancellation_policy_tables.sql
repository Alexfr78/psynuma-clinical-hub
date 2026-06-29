-- Explicit table privileges for projects where public default grants are revoked.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancellation_policy_versions TO authenticated;
GRANT ALL ON public.cancellation_policy_versions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cancellation_charges TO authenticated;
GRANT ALL ON public.cancellation_charges TO service_role;
