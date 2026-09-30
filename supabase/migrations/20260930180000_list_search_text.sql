-- Campos calculados `search_text` para buscar en servidor en los listados paginados.
--
-- PostgREST no permite un OR entre columnas de la tabla y de una relacionada (p. ej. "número
-- de factura o nombre del paciente"). Un campo calculado sí se puede usar en filtros y en or():
--   GET /invoices?search_text=ilike.*ana*
--
-- Cada función junta los campos buscables separados por chr(31) (separador de unidad, nadie lo
-- teclea), así que una coincidencia equivale a "contiene el texto en alguno de los campos",
-- igual que la búsqueda que se hacía en el navegador. Alcance acordado el 30-sep-2026: nombre
-- y apellidos del paciente y número de factura (y referencia de pago); la búsqueda por fecha
-- escrita se deja de ofrecer.
--
-- STABLE + SECURITY INVOKER: se aplica la RLS de patients/invoices como en cualquier consulta.

create or replace function public.search_text(public.invoices)
returns text language sql stable security invoker set search_path = public as $$
  select concat_ws(chr(31),
    (select concat_ws(' ', p.first_name, p.last_name) from patients p where p.id = $1.patient_id),
    $1.invoice_number)
$$;

create or replace function public.search_text(public.debts)
returns text language sql stable security invoker set search_path = public as $$
  select concat_ws(chr(31),
    (select concat_ws(' ', p.first_name, p.last_name) from patients p where p.id = $1.patient_id),
    (select i.invoice_number from invoices i where i.id = $1.invoice_id))
$$;

create or replace function public.search_text(public.payments)
returns text language sql stable security invoker set search_path = public as $$
  select concat_ws(chr(31),
    (select concat_ws(' ', p.first_name, p.last_name) from patients p where p.id = $1.patient_id),
    $1.reference,
    (select i.invoice_number from invoices i where i.id = $1.invoice_id))
$$;

-- Auditoría Verifactu: se mantenía la búsqueda parcial por id de factura; se añade el número.
create or replace function public.search_text(public.verifactu_events)
returns text language sql stable security invoker set search_path = public as $$
  select concat_ws(chr(31),
    $1.invoice_id::text,
    (select i.invoice_number from invoices i where i.id = $1.invoice_id))
$$;

-- Autorregistros: los valores de la entrada unidos por espacios, como
-- Object.values(values).map(String).join(' ') en el navegador.
create or replace function public.search_text(public.autoregistro_entries)
returns text language sql stable security invoker set search_path = public as $$
  select coalesce((
    select string_agg(v.value, ' ' order by v.ordinality)
    from jsonb_each_text(coalesce($1.values, '{}'::jsonb)) with ordinality as v(key, value, ordinality)
  ), '')
$$;

revoke all on function public.search_text(public.invoices) from public, anon;
revoke all on function public.search_text(public.debts) from public, anon;
revoke all on function public.search_text(public.payments) from public, anon;
revoke all on function public.search_text(public.verifactu_events) from public, anon;
revoke all on function public.search_text(public.autoregistro_entries) from public, anon;
grant execute on function public.search_text(public.invoices) to authenticated;
grant execute on function public.search_text(public.debts) to authenticated;
grant execute on function public.search_text(public.payments) to authenticated;
grant execute on function public.search_text(public.verifactu_events) to authenticated;
grant execute on function public.search_text(public.autoregistro_entries) to authenticated;
