-- 1.1. Enlaces contables a bono
alter table public.debts
  add column if not exists bono_id uuid references public.bonos(id) on delete set null;

alter table public.invoice_items
  add column if not exists bono_id uuid references public.bonos(id) on delete set null;

-- 1.2. Idempotencia: una sesión solo puede consumirse una vez por bono
create unique index if not exists uniq_bono_items_bono_session
on public.bono_items (bono_id, session_id);

-- 2.1. apply_bono_to_session(bono_id, session_id)
create or replace function public.apply_bono_to_session(p_bono_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_bono record;
  v_inserted boolean := false;
begin
  -- Lock bono row to avoid race conditions
  select * into v_bono
  from public.bonos
  where id = p_bono_id
  for update;

  if not found then
    raise exception 'Bono no existe';
  end if;

  if v_bono.status is not null and v_bono.status not in ('active') then
    raise exception 'Bono no está activo';
  end if;

  if coalesce(v_bono.used_sessions,0) >= coalesce(v_bono.total_sessions,0) then
    raise exception 'Bono sin sesiones disponibles';
  end if;

  -- Ensure session exists
  perform 1 from public.sessions where id = p_session_id;
  if not found then
    raise exception 'Sesión no existe';
  end if;

  -- Insert consumption if not exists
  begin
    insert into public.bono_items (bono_id, session_id, created_at)
    values (p_bono_id, p_session_id, now());
    v_inserted := true;
  exception when unique_violation then
    v_inserted := false; -- already consumed
  end;

  -- Link bono to session (always)
  update public.sessions
    set bono_id = p_bono_id,
        updated_at = now()
  where id = p_session_id;

  -- Only increment used_sessions if a new bono_item was created
  if v_inserted then
    update public.bonos
      set used_sessions = coalesce(used_sessions,0) + 1,
          updated_at = now()
    where id = p_bono_id;

    -- If exhausted, mark status
    update public.bonos
      set status = case
        when coalesce(used_sessions,0) >= coalesce(total_sessions,0) then 'exhausted'
        else status
      end
    where id = p_bono_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'inserted', v_inserted
  );
end;
$$;

-- 2.2. remove_bono_from_session(session_id)
create or replace function public.remove_bono_from_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_bono_id uuid;
  v_deleted boolean := false;
begin
  select bono_id into v_bono_id
  from public.sessions
  where id = p_session_id;

  if v_bono_id is null then
    return jsonb_build_object('ok', true, 'deleted', false, 'reason', 'no_bono_linked');
  end if;

  -- delete consumption row if exists
  delete from public.bono_items
  where session_id = p_session_id and bono_id = v_bono_id
  returning true into v_deleted;

  -- unlink session
  update public.sessions
    set bono_id = null,
        updated_at = now()
  where id = p_session_id;

  -- decrement only if we actually deleted a consumption row
  if v_deleted then
    update public.bonos
      set used_sessions = greatest(coalesce(used_sessions,0) - 1, 0),
          status = 'active',
          updated_at = now()
    where id = v_bono_id;
  end if;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;