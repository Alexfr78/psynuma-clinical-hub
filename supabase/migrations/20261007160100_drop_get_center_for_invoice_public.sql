-- Segunda parte de 20261007160000_rpc_center_authorization.sql.
--
-- /factura/:token ya usa get_center_for_invoice_token. La versión antigua,
-- que recibe un center_id libre y devolvía NIF, dirección y teléfono de
-- cualquier centro a anon, queda solo para la service role. Se aplica
-- después de publicar la web que usa la versión con token.

REVOKE ALL ON FUNCTION public.get_center_for_invoice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_center_for_invoice(uuid) TO service_role;
