/* TAFAß V41.1 — OWNER_ID AMBIGUITY HOTFIX
   Fixes PostgreSQL: column reference "owner_id" is ambiguous.
   Safe to re-run. No existing data is deleted or modified.
*/

/* ============================================================
   1) PAGE FOLLOW — explicitly qualify pages.owner_id
============================================================ */
create or replace function public.tafa_toggle_page_follow(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_following boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'message','Connexion requise.');
  end if;

  select p.owner_id
    into v_owner_id
  from public.pages as p
  where p.id=p_page_id;

  if not found then
    return jsonb_build_object('success',false,'message','Page introuvable.');
  end if;

  if v_owner_id=v_uid then
    return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas suivre sa propre Page.');
  end if;

  select exists(
    select 1
    from public.page_followers as f
    where f.page_id=p_page_id
      and f.user_id=v_uid
  ) into v_following;

  if v_following then
    delete from public.page_followers as f
    where f.page_id=p_page_id
      and f.user_id=v_uid;

    return jsonb_build_object('success',true,'followed',false);
  end if;

  insert into public.page_followers(page_id,user_id)
  values(p_page_id,v_uid)
  on conflict(page_id,user_id) do nothing;

  select exists(
    select 1
    from public.page_followers as f
    where f.page_id=p_page_id
      and f.user_id=v_uid
  ) into v_following;

  return jsonb_build_object('success',true,'followed',v_following);
exception when others then
  return jsonb_build_object('success',false,'message',coalesce(sqlerrm,'Impossible de modifier le suivi de la Page.'));
end;
$$;

grant execute on function public.tafa_toggle_page_follow(uuid) to authenticated;

/* ============================================================
   2) GROUP JOIN — explicitly qualify groups.owner_id
============================================================ */
create or replace function public.tafa_toggle_group_membership(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_privacy text := 'public';
  v_member_id uuid;
  v_member_role text;
begin
  if v_uid is null then
    return jsonb_build_object('success',false,'message','Connexion requise.');
  end if;

  select g.owner_id,coalesce(g.privacy,'public')
    into v_owner_id,v_privacy
  from public.groups as g
  where g.id=p_group_id;

  if not found then
    return jsonb_build_object('success',false,'message','Groupe introuvable.');
  end if;

  select gm.id,gm.role
    into v_member_id,v_member_role
  from public.group_members as gm
  where gm.group_id=p_group_id
    and gm.user_id=v_uid
  limit 1;

  if v_member_id is not null then
    if v_member_role='owner' or v_owner_id=v_uid then
      return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas quitter son propre groupe.');
    end if;

    delete from public.group_members as gm
    where gm.id=v_member_id;

    return jsonb_build_object('success',true,'joined',false);
  end if;

  if v_owner_id<>v_uid and lower(v_privacy) not in ('public','publique') then
    return jsonb_build_object('success',false,'message','Ce groupe est privé. Une invitation ou une validation est nécessaire.');
  end if;

  insert into public.group_members(group_id,user_id,role)
  values(p_group_id,v_uid,'member')
  on conflict(group_id,user_id) do nothing;

  return jsonb_build_object(
    'success',true,
    'joined',exists(
      select 1 from public.group_members as gm
      where gm.group_id=p_group_id and gm.user_id=v_uid
    )
  );
exception when others then
  return jsonb_build_object('success',false,'message',coalesce(sqlerrm,'Impossible de modifier votre adhésion au groupe.'));
end;
$$;

grant execute on function public.tafa_toggle_group_membership(uuid) to authenticated;

notify pgrst,'reload schema';

select 'TAFAß V41.1 — OWNER_ID AMBIGUITY FIX READY' as status;
