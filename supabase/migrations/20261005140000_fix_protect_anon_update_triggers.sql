-- Los triggers que impiden cambiar campos protegidos por enlace público no
-- funcionaban: eran SECURITY DEFINER (propietario postgres), así que dentro
-- `current_user` siempre valía 'postgres' y la comprobación se saltaba. Además
-- solo miraban `auth.uid() IS NULL`, y desde 20261005120000 las políticas con
-- token también valen para `authenticated`.
--
-- Ahora se ejecutan como quien llama y solo eximen al servidor (service_role,
-- postgres) y al equipo del propio centro de la fila.
-- Aplicada en producción el 2026-10-05 vía query_database.

create or replace function public.protect_session_anon_update()
 returns trigger language plpgsql security invoker set search_path to 'public'
as $function$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role')
     or (auth.uid() is not null
         and OLD.center_id = public.get_user_center_id(auth.uid())
         and (public.is_admin(auth.uid()) or public.is_professional(auth.uid())))
  then
    return NEW;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.center_id is distinct from OLD.center_id
     or NEW.patient_id is distinct from OLD.patient_id
     or NEW.professional_id is distinct from OLD.professional_id
     or NEW.session_type_id is distinct from OLD.session_type_id
     or NEW.price is distinct from OLD.price
     or NEW.payment_status is distinct from OLD.payment_status
     or NEW.bono_id is distinct from OLD.bono_id
     or NEW.access_token is distinct from OLD.access_token
     or NEW.created_at is distinct from OLD.created_at
  then
    raise exception 'Anonymous updates cannot modify protected fields on sessions';
  end if;
  return NEW;
end;
$function$;

create or replace function public.protect_consent_anon_update()
 returns trigger language plpgsql security invoker set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or current_user in ('postgres', 'supabase_admin', 'service_role')
     or (auth.uid() is not null
         and OLD.center_id = public.get_user_center_id(auth.uid())
         and (public.is_admin(auth.uid()) or public.is_professional(auth.uid())))
  then
    return NEW;
  end if;

  if NEW.id is distinct from OLD.id
     or NEW.center_id is distinct from OLD.center_id
     or NEW.patient_id is distinct from OLD.patient_id
     or NEW.template_id is distinct from OLD.template_id
     or NEW.professional_id is distinct from OLD.professional_id
     or NEW.access_token is distinct from OLD.access_token
     or NEW.content_snapshot is distinct from OLD.content_snapshot
     or NEW.requires_guardian is distinct from OLD.requires_guardian
     or NEW.expires_at is distinct from OLD.expires_at
     or NEW.created_at is distinct from OLD.created_at
     or NEW.revoked_at is distinct from OLD.revoked_at
     or NEW.revocation_reason is distinct from OLD.revocation_reason
     or NEW.uploaded_file_url is distinct from OLD.uploaded_file_url
     or NEW.source is distinct from OLD.source
  then
    raise exception 'Anonymous updates can only modify signature/verification fields on consents';
  end if;
  return NEW;
end;
$function$;

-- anon nunca tuvo UPDATE sobre consents; ampliar esta política a authenticated
-- solo abría la puerta. Vuelve a anon.
alter policy "Anon update consent by valid token" on public.consents to anon;
