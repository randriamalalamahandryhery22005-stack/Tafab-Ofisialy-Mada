-- ============================================================
-- TAFAß V78 — ADMIN SINGLE VERSION / USER MODERATION
-- Run AFTER V74/V75/V76 SQL.
-- Uses profiles.is_admin; never references profiles.role.
-- ============================================================

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles
  add column if not exists deleted_at timestamptz;

update public.profiles
set account_status='active'
where account_status is null or trim(account_status)='';

-- Normalize only known moderation states.
update public.profiles
set account_status='active'
where account_status not in ('active','restricted','blocked','deleted');

create or replace function public.tafa_admin_manage_user_v78(
  p_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  is_admin boolean;
  action text := lower(trim(coalesce(p_action,'')));
  target_admin boolean;
  deleted_auth boolean := false;
begin
  select coalesce(is_admin,false) into is_admin
  from public.profiles
  where id=auth.uid();

  if not is_admin then
    raise exception 'Accès réservé à l’administration';
  end if;

  if p_user_id is null then
    raise exception 'Compte utilisateur invalide';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'L’administrateur ne peut pas gérer son propre compte';
  end if;

  if action not in ('active','restricted','blocked','deleted') then
    raise exception 'Action administrative invalide';
  end if;

  select coalesce(is_admin,false) into target_admin
  from public.profiles
  where id=p_user_id;

  if target_admin=true then
    raise exception 'Un compte administrateur ne peut pas être supprimé ou modifié depuis cette interface';
  end if;

  if not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'Compte utilisateur introuvable';
  end if;

  if action='deleted' then
    -- Preferred path: delete the Auth account. Supabase will cascade to
    -- dependent rows when the project's foreign keys are configured with
    -- ON DELETE CASCADE.
    begin
      delete from auth.users where id=p_user_id;
      deleted_auth := true;
    exception when others then
      -- Keep the moderation action usable even when a legacy FK prevents a
      -- physical Auth deletion. The account is then anonymized/soft-deleted.
      deleted_auth := false;
    end;

    if not deleted_auth then
      update public.profiles
      set account_status='deleted',
          deleted_at=coalesce(deleted_at,now()),
          first_name='Compte',
          last_name='supprimé',
          username=null,
          avatar_url=null,
          cover_url=null,
          bio=null,
          updated_at=now()
      where id=p_user_id;
      return jsonb_build_object('ok',true,'status','deleted','mode','soft_delete');
    end if;

    return jsonb_build_object('ok',true,'status','deleted','mode','auth_delete');
  end if;

  update public.profiles
  set account_status=action,
      deleted_at=null,
      updated_at=now()
  where id=p_user_id;

  return jsonb_build_object('ok',true,'status',action,'mode','profile_status');
end;
$$;

revoke all on function public.tafa_admin_manage_user_v78(uuid,text) from public;
grant execute on function public.tafa_admin_manage_user_v78(uuid,text) to authenticated;

-- Persist signup identity from Auth metadata so a named account does not
-- later fall back to the generic “Membre Tafaß” label.
create or replace function public.tafa_v78_sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  fn text := nullif(trim(coalesce(new.raw_user_meta_data->>'first_name',new.raw_user_meta_data->>'given_name','')),'');
  ln text := nullif(trim(coalesce(new.raw_user_meta_data->>'last_name',new.raw_user_meta_data->>'family_name','')),'');
  ph text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone','')),'');
  pc text := nullif(trim(coalesce(new.raw_user_meta_data->>'phone_code','+261')),'');
  co text := nullif(trim(coalesce(new.raw_user_meta_data->>'country','Madagascar')),'');
begin
  insert into public.profiles(id,first_name,last_name,email,phone,phone_code,country,account_status,updated_at)
  values(new.id,coalesce(fn,''),coalesce(ln,''),new.email,ph,pc,co,'active',now())
  on conflict(id) do update set
    first_name=case when nullif(trim(coalesce(public.profiles.first_name,'')),'') is null
                         or lower(trim(coalesce(public.profiles.first_name,'')||' '||coalesce(public.profiles.last_name,''))) in ('membre tafaß','membre tafass')
                    then coalesce(fn,public.profiles.first_name) else public.profiles.first_name end,
    last_name=case when nullif(trim(coalesce(public.profiles.last_name,'')),'') is null
                        or lower(trim(coalesce(public.profiles.first_name,'')||' '||coalesce(public.profiles.last_name,''))) in ('membre tafaß','membre tafass')
                   then coalesce(ln,public.profiles.last_name) else public.profiles.last_name end,
    email=coalesce(nullif(trim(coalesce(public.profiles.email,'')),''),new.email),
    phone=coalesce(nullif(trim(coalesce(public.profiles.phone,'')),''),ph),
    phone_code=coalesce(nullif(trim(coalesce(public.profiles.phone_code,'')),''),pc),
    country=coalesce(nullif(trim(coalesce(public.profiles.country,'')),''),co,'Madagascar'),
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists tafa_v78_auth_profile_sync on auth.users;
create trigger tafa_v78_auth_profile_sync
after insert on auth.users
for each row execute function public.tafa_v78_sync_profile_from_auth();

-- Keep the moderation status realtime for the admin dashboard and the
-- affected account.
do $$
begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null;
end $$;
