-- Resumen de "pendiente de cobro" en una sola función, calculado en la base.
--
-- Sustituye a dos cálculos del cliente que no coincidían (Dashboard y useDebtStats) y
-- que además se quedaban cortos sin avisar a partir de 1.000 filas (tope de PostgREST).
--
-- Regla (confirmada el 30-sep-2026):
--  · Deudas pendientes o parciales: cuenta lo que falta por cobrar, salvo que su factura
--    haya sido invalidada por una rectificativa.
--  · Facturas emitidas y válidas que no tienen NINGUNA deuda registrada (facturas antiguas):
--    cuentan por su total. Una factura con su deuda ya pagada NO cuenta como pendiente.
--  · Vencida: deuda con fecha de vencimiento de hoy o anterior (igual que el cálculo previo).
--
-- SECURITY INVOKER: se aplica la RLS de debts e invoices, así que cada usuario solo suma
-- lo de su centro, exactamente como las consultas que reemplaza.

create or replace function public.get_receivables_summary()
returns table (
  total_pending numeric,
  overdue_amount numeric,
  overdue_count integer,
  total_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with open_debts as (
    select d.amount - coalesce(d.paid_amount, 0) as remaining,
           d.due_date
    from debts d
    left join invoices i on i.id = d.invoice_id
    where d.status in ('pending', 'partial')
      and coalesce(i.is_valid, true)
  ),
  invoices_without_debt as (
    select i.total as remaining,
           null::date as due_date
    from invoices i
    where i.status = 'issued'
      and i.is_valid
      and not exists (select 1 from debts d where d.invoice_id = i.id)
  ),
  receivables as (
    select * from open_debts
    union all
    select * from invoices_without_debt
  )
  select
    coalesce(sum(remaining), 0),
    coalesce(sum(remaining) filter (where due_date <= (now() at time zone 'utc')::date), 0),
    (count(*) filter (where due_date <= (now() at time zone 'utc')::date))::integer,
    count(*)::integer
  from receivables;
$$;

revoke all on function public.get_receivables_summary() from public, anon;
grant execute on function public.get_receivables_summary() to authenticated;
