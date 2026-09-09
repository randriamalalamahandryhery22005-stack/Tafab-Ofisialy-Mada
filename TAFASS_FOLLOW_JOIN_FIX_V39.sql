-- TAFAß V39 — PAGE FOLLOW + GROUP JOIN FIX
-- Safe to re-run. Does not delete existing data.
-- Execute once in Supabase SQL Editor.

begin;

create or replace function public.tafa_toggle_page_follow(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  page_row public.pages%rowtype;
  existing_id uuid;
  followed boolean;
begin
  if uid is null then
    return jsonb_build_object('success',false,'message','Vous devez être connecté.');
  end if;

  select * into page_row from public.pages where id=p_page_id;
  if not found then
    return jsonb_build_object('success',false,'message','Page introuvable.');
  end if;

  if page_row.owner_id=uid then
    return jsonb_build_object('success',false,'message','Vous ne pouvez pas suivre votre propre Page.');
  end if;

  select id into existing_id
  from public.page_followers
  where page_id=p_page_id and user_id=uid
  limit 1;

  if existing_id is not null then
    delete from public.page_followers where id=existing_id;
    followed := false;
  else
    insert into public.page_followers(page_id,user_id)
    values(p_page_id,uid)
    on conflict(page_id,user_id) do nothing;
    followed := exists(select 1 from public.page_followers where page_id=p_page_id and user_id=uid);
  end if;

  return jsonb_build_object('success',true,'followed',followed);
exception when others then
  return jsonb_build_object('success',false,'message',coalesce(sqlerrm,'Impossible de modifier le suivi de la Page.'));
end;
$$;

grant execute on function public.tafa_toggle_page_follow(uuid) to authenticated;

create or replace function public.tafa_toggle_group_membership(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  group_row public.groups%rowtype;
  existing_id uuid;
  existing_role text;
  joined boolean;
begin
  if uid is null then
    return jsonb_build_object('success',false,'message','Vous devez être connecté.');
  end if;

  select * into group_row from public.groups where id=p_group_id;
  if not found then
    return jsonb_build_object('success',false,'message','Groupe introuvable.');
  end if;

  select id,role into existing_id,existing_role
  from public.group_members
  where group_id=p_group_id and user_id=uid
  limit 1;

  if existing_id is not null then
    if existing_role='owner' or group_row.owner_id=uid then
      return jsonb_build_object('success',false,'message','Le propriétaire ne peut pas quitter son propre groupe.');
    end if;
    delete from public.group_members where id=existing_id;
    joined := false;
  else
    if lower(coalesce(group_row.privacy,'public')) <> 'public' then
      return jsonb_build_object('success',false,'message','Ce groupe est privé. Une invitation est nécessaire pour le rejoindre.');
    end if;
    insert into public.group_members(group_id,user_id,role)
    values(p_group_id,uid,'member')
    on conflict(group_id,user_id) do nothing;
    joined := exists(select 1 from public.group_members where group_id=p_group_id and user_id=uid);
  end if;

  return jsonb_build_object('success',true,'joined',joined);
exception when others then
  return jsonb_build_object('success',false,'message',coalesce(sqlerrm,'Impossible de modifier votre adhésion au groupe.'));
end;
$$;

grant execute on function public.tafa_toggle_group_membership(uuid) to authenticated;

commit;

select 'TAFAß V39 — PAGE FOLLOW + GROUP JOIN READY' as status;
