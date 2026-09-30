-- La búsqueda de Auditoría Verifactu en el navegador miraba el id de factura, el tipo de evento
-- y el CSV de la AEAT. search_text(verifactu_events) solo tenía el id y el número de factura:
-- se añaden los dos campos que faltaban para no perder resultados.

create or replace function public.search_text(public.verifactu_events)
returns text language sql stable security invoker set search_path = public as $$
  select concat_ws(chr(31),
    $1.invoice_id::text,
    $1.event_type,
    $1.aeat_csv,
    (select i.invoice_number from invoices i where i.id = $1.invoice_id))
$$;
