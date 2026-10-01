-- Cobro de una sesión repartido entre varios métodos (p. ej. parte en efectivo y parte en Bizum).
--
-- Cada parte se registra como un pago independiente con su propio método, reutilizando
-- collect_session_payment_v2 (misma validación de centro, bono, saldo pendiente y
-- sincronización de deuda/sesión/factura). Todo ocurre en una única transacción: si una
-- parte falla (p. ej. la suma supera lo pendiente), no se guarda ninguna.
--
-- p_parts: [{"method": "cash", "amount": 30}, {"method": "bizum", "amount": 20}]

create or replace function public.collect_session_payment_split(
  p_session_id uuid,
  p_patient_id uuid,
  p_parts jsonb,
  p_payment_date date default current_date,
  p_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_part jsonb;
  v_amount numeric(10,2);
  v_method text;
  v_result jsonb;
  v_payment_ids uuid[] := '{}';
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    raise exception 'Un cobro dividido necesita al menos dos partes';
  end if;

  for v_part in select * from jsonb_array_elements(p_parts) loop
    v_method := nullif(trim(v_part->>'method'), '');
    v_amount := (v_part->>'amount')::numeric;

    if v_method is null then
      raise exception 'Cada parte del cobro necesita un método de pago';
    end if;

    v_result := public.collect_session_payment_v2(
      p_session_id, p_patient_id, v_amount, v_method,
      p_payment_date, p_reference, p_notes
    );
    v_payment_ids := v_payment_ids || (v_result->>'payment_id')::uuid;
  end loop;

  return v_result || jsonb_build_object(
    'payment_ids', to_jsonb(v_payment_ids),
    'amount_paid', (select sum((p->>'amount')::numeric) from jsonb_array_elements(p_parts) p)
  );
end;
$$;

revoke all on function public.collect_session_payment_split(uuid, uuid, jsonb, date, text, text) from public, anon;
grant execute on function public.collect_session_payment_split(uuid, uuid, jsonb, date, text, text) to authenticated, service_role;
