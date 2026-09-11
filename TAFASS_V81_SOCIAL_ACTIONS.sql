-- Tafaß V81 — secure Page Follow / Group Membership actions + realtime.
-- Run after the V80 SQL. Functions use the authenticated user only.
begin;

create or replace function public.tafa_v81_toggle_page_follow(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  row_id uuid;
  is_followed boolean;
begin
  if uid is null then raise exception 'Authentification requise.'; end if;
  select p.owner_id into owner_id from public.pages p where p.id=p_page_id and coalesce(p.deletion_status,'active') <> 'deleted';
  if owner_id is null then raise exception 'Page introuvable.'; end if;
  if owner_id=uid then raise exception 'Le propriétaire ne peut pas suivre sa propre Page.'; end if;
  select id into row_id from public.page_followers where page_id=p_page_id and user_id=uid limit 1;
  if row_id is not null then
    delete from public.page_followers where id=row_id;
    is_followed:=false;
  else
    insert into public.page_followers(page_id,user_id) values(p_page_id,uid);
    is_followed:=true;
  end if;
  return jsonb_build_object('success',true,'followed',is_followed);
end $$;

create or replace function public.tafa_v81_request_group_join(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid(); owner_id uuid; privacy text; existing_id uuid;
begin
  if uid is null then raise exception 'Authentification requise.'; end if;
  select g.owner_id,coalesce(g.privacy,'public') into owner_id,privacy from public.groups g where g.id=p_group_id and coalesce(g.deletion_status,'active') <> 'deleted';
  if owner_id is null then raise exception 'Groupe introuvable.'; end if;
  if lower(privacy) <> 'private' then
    insert into public.group_members(group_id,user_id,role) values(p_group_id,uid,'member') on conflict (group_id,user_id) do nothing;
    return jsonb_build_object('success',true,'joined',true,'requested',false);
  end if;
  select id into existing_id from public.group_join_requests where group_id=p_group_id and user_id=uid and status='pending' limit 1;
  if existing_id is not null then return jsonb_build_object('success',true,'requested',true,'already_requested',true); end if;
  insert into public.group_join_requests(group_id,user_id,status) values(p_group_id,uid,'pending');
  return jsonb_build_object('success',true,'requested',true,'already_requested',false);
end $$;

grant execute on function public.tafa_v81_request_group_join(uuid) to authenticated;

create or replace function public.tafa_v81_toggle_group_membership(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  owner_id uuid;
  privacy text;
  row_id uuid;
  is_joined boolean;
begin
  if uid is null then raise exception 'Authentification requise.'; end if;
  select g.owner_id, coalesce(g.privacy,'public') into owner_id,privacy from public.groups g where g.id=p_group_id and coalesce(g.deletion_status,'active') <> 'deleted';
  if owner_id is null then raise exception 'Groupe introuvable.'; end if;
  select id into row_id from public.group_members where group_id=p_group_id and user_id=uid limit 1;
  if row_id is not null then
    if owner_id=uid then raise exception 'Le propriétaire ne peut pas quitter son propre groupe.'; end if;
    delete from public.group_members where id=row_id;
    is_joined:=false;
  else
    if lower(privacy)='private' then
      return jsonb_build_object('success',true,'joined',false,'requested',true);
    end if;
    insert into public.group_members(group_id,user_id,role) values(p_group_id,uid,'member');
    is_joined:=true;
  end if;
  return jsonb_build_object('success',true,'joined',is_joined);
end $$;

grant execute on function public.tafa_v81_toggle_page_follow(uuid) to authenticated;
grant execute on function public.tafa_v81_toggle_group_membership(uuid) to authenticated;

-- Realtime for relationship/entity actions. Missing tables are skipped safely.
do $$
declare t text;
begin
  foreach t in array array['profiles','friend_requests','friendships','follows','pages','page_followers','groups','group_members','group_join_requests'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I replica identity full',t);
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
        begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
      end if;
    end if;
  end loop;
end $$;

commit;
