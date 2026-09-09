-- Revoke all from public and grant only to authenticated
REVOKE ALL ON FUNCTION public.recompute_debt_by_invoice(uuid) FROM public;
REVOKE ALL ON FUNCTION public.get_debt_id_for_payment_by_invoice(uuid) FROM public;
REVOKE ALL ON FUNCTION public.delete_payment_and_recompute_debt_v2(uuid) FROM public;
REVOKE ALL ON FUNCTION public.update_payment_and_recompute_debt_v2(uuid, numeric, timestamptz, text, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public.recompute_debt_by_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_debt_id_for_payment_by_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_payment_and_recompute_debt_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_and_recompute_debt_v2(uuid, numeric, timestamptz, text, text, text) TO authenticated;