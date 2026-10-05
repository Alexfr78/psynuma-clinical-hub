-- Alta de profesionales en dos pasos y desvío de pacientes al portal.
--
-- El registro libre creaba al instante una cuenta de profesional con centro
-- propio, y algunos pacientes se registraban por error. Ahora el alta deja una
-- solicitud pendiente y la cuenta solo se crea al abrir el enlace recibido por
-- email. Si el email es de un paciente, no se crea nada: se le manda el acceso a
-- su portal. La pantalla responde siempre igual para no revelar quién es paciente.

create table if not exists public.pending_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text,
  last_name text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pending_signups_email_idx on public.pending_signups (lower(email));

alter table public.pending_signups enable row level security;
revoke all on public.pending_signups from anon, authenticated;

-- Solo para edge functions (service_role): ¿hay ya una cuenta con este email?
create or replace function public.auth_email_exists(p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select exists (
    select 1 from auth.users u where lower(u.email) = lower(trim(p_email))
  );
$$;

-- Solo para edge functions: centros donde este email es de un paciente.
create or replace function public.find_patient_centers_by_email(p_email text)
returns table(center_id uuid, center_name text, portal_slug text, portal_enabled boolean, patient_first_name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct on (c.id)
    c.id, c.name, c.portal_slug, coalesce(c.portal_enabled, false), p.first_name
  from public.patients p
  join public.centers c on c.id = p.center_id
  where p.email is not null
    and lower(trim(p.email)) = lower(trim(p_email))
  order by c.id, p.updated_at desc nulls last;
$$;

revoke all on function public.auth_email_exists(text) from public, anon, authenticated;
revoke all on function public.find_patient_centers_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_email_exists(text) to service_role;
grant execute on function public.find_patient_centers_by_email(text) to service_role;

-- Para /cita/:token: slug del portal del centro de la cita, si está activo.
create or replace function public.get_portal_slug_for_session_token()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.portal_slug
  from public.sessions s
  join public.centers c on c.id = s.center_id
  where s.access_token = public.get_session_token()
    and c.portal_enabled = true
    and c.portal_slug is not null
  limit 1;
$$;

revoke all on function public.get_portal_slug_for_session_token() from public;
grant execute on function public.get_portal_slug_for_session_token() to anon, authenticated, service_role;
