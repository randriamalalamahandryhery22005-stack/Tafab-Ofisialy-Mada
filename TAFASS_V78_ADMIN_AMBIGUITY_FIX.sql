-- Tafaß V78 — FIX: ambiguous "is_admin" column reference
-- Cause: the PL/pgSQL variables were named exactly like profiles.is_admin.
-- Run this patch after the existing V78 SQL. It only replaces the affected
-- function and does not change the profiles table.

begin;

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
  v_is_admin boolean := false;
  v_action text := lower(trim(coalesce(p_action,'')));
  v_target_admin boolean := false;
  v_deleted_auth boolean := false;
begin
  -- Explicit table alias removes the PostgreSQL ambiguity:
  -- profiles.is_admin vs the local PL/pgSQL variable.
  select coalesce(p.is_admin,false)
    into v_is_admin
  from public.profiles as p
  where p.id=auth.uid();

  if not v_is_admin then
    raise exception 'Accès réservé à l’administration';
  end if;

  if p_user_id is null then
    raise exception 'Compte utilisateur invalide';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'L’administrateur ne peut pas gérer son propre compte';
  end if;

  if v_action not in ('active','restricted','blocked','deleted') then
    raise exception 'Action administrative invalide';
  end if;

  select coalesce(p.is_admin,false)
    into v_target_admin
  from public.profiles as p
  where p.id=p_user_id;

  if v_target_admin=true then
    raise exception 'Un compte administrateur ne peut pas être supprimé ou modifié depuis cette interface';
  end if;

  if not exists (
    select 1
    from public.profiles as p
    where p.id=p_user_id
  ) then
    raise exception 'Compte utilisateur introuvable';
  end if;

  if v_action='deleted' then
    begin
      delete from auth.users where id=p_user_id;
      v_deleted_auth := true;
    exception when others then
      v_deleted_auth := false;
    end;

    if not v_deleted_auth then
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

      return jsonb_build_object(
        'ok',true,
        'status','deleted',
        'mode','soft_delete'
      );
    end if;

    return jsonb_build_object(
      'ok',true,
      'status','deleted',
      'mode','auth_delete'
    );
  end if;

  update public.profiles
  set account_status=v_action,
      deleted_at=null,
      updated_at=now()
  where id=p_user_id;

  return jsonb_build_object(
    'ok',true,
    'status',v_action,
    'mode','profile_status'
  );
end;
$$;

revoke all on function public.tafa_admin_manage_user_v78(uuid,text) from public;
grant execute on function public.tafa_admin_manage_user_v78(uuid,text) to authenticated;

commit;
