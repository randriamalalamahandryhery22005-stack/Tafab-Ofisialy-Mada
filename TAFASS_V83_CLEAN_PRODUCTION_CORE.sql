-- ============================================================
-- Tafaß V83 — CLEAN PRODUCTION CORE
-- Idempotent hardening for the current Pages/Groups production core.
-- Run AFTER the existing schema/V81 migrations.
-- This file does not drop user data and does not recreate the schema.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Prevent the historical is_admin ambiguity from returning.
-- ------------------------------------------------------------
create or replace function public.tafa_admin_manage_user_v83(
  p_user_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_actor_is_admin boolean := false;
  v_target_is_admin boolean := false;
  v_action text := lower(trim(coalesce(p_action,'')));
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.';
  end if;

  select coalesce(p.is_admin,false)
    into v_actor_is_admin
  from public.profiles as p
  where p.id=auth.uid();

  if not v_actor_is_admin then
    raise exception 'Accès réservé à l’administration.';
  end if;

  if p_user_id is null or not exists(
    select 1 from public.profiles as p where p.id=p_user_id
  ) then
    raise exception 'Compte utilisateur introuvable.';
  end if;

  if p_user_id=auth.uid() then
    raise exception 'Un administrateur ne peut pas gérer son propre compte.';
  end if;

  if v_action not in ('active','restricted','blocked','deleted') then
    raise exception 'Action administrative invalide.';
  end if;

  select coalesce(p.is_admin,false)
    into v_target_is_admin
  from public.profiles as p
  where p.id=p_user_id;

  if v_target_is_admin then
    raise exception 'Un compte administrateur ne peut pas être modifié depuis cette interface.';
  end if;

  update public.profiles as p
  set account_status=v_action,
      deleted_at=case when v_action='deleted' then coalesce(p.deleted_at,now()) else null end,
      updated_at=now()
  where p.id=p_user_id;

  return jsonb_build_object('ok',true,'status',v_action);
end;
$$;

revoke all on function public.tafa_admin_manage_user_v83(uuid,text) from public;
grant execute on function public.tafa_admin_manage_user_v83(uuid,text) to authenticated;

-- ------------------------------------------------------------
-- 2. Compatibility: follower rows are addressed by the stable composite key.
-- Some older production databases created page_followers without an id column.
-- V83 therefore never requires page_followers.id.

create or replace function public.tafa_toggle_page_follow_v83(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_followed boolean;
begin
  if v_uid is null then raise exception 'Authentification requise.'; end if;
  select p.owner_id into v_owner from public.pages p where p.id=p_page_id and coalesce(p.deletion_status,'active') <> 'deleted';
  if v_owner is null then raise exception 'Page introuvable.'; end if;
  if v_owner=v_uid then raise exception 'Le propriétaire ne peut pas suivre sa propre Page.'; end if;
  if exists(select 1 from public.page_followers f where f.page_id=p_page_id and f.user_id=v_uid) then
    delete from public.page_followers f where f.page_id=p_page_id and f.user_id=v_uid;
    v_followed:=false;
  else
    insert into public.page_followers(page_id,user_id) values(p_page_id,v_uid) on conflict(page_id,user_id) do nothing;
    v_followed:=exists(select 1 from public.page_followers f where f.page_id=p_page_id and f.user_id=v_uid);
  end if;
  return jsonb_build_object('success',true,'followed',v_followed);
end;
$$;
revoke all on function public.tafa_toggle_page_follow_v83(uuid) from public;
grant execute on function public.tafa_toggle_page_follow_v83(uuid) to authenticated;

-- 3. Required Page/Group indexes. Safe if they already exist.
-- ------------------------------------------------------------
create index if not exists pages_owner_created_idx
  on public.pages(owner_id,created_at desc);

create index if not exists pages_status_created_idx
  on public.pages(deletion_status,created_at desc);

create unique index if not exists page_followers_page_user_uidx
  on public.page_followers(page_id,user_id);

create index if not exists page_followers_page_created_idx
  on public.page_followers(page_id,created_at desc);

create index if not exists page_posts_page_created_idx
  on public.page_posts(page_id,created_at desc);

create index if not exists page_post_reactions_post_idx
  on public.page_post_reactions(page_post_id,created_at desc);

create index if not exists page_post_comments_post_idx
  on public.page_post_comments(page_post_id,created_at desc);

create index if not exists page_post_shares_post_idx
  on public.page_post_shares(page_post_id,created_at desc);

create index if not exists group_members_group_created_idx
  on public.group_members(group_id,created_at desc);

create index if not exists group_posts_group_created_idx
  on public.group_posts(group_id,created_at desc);

-- ------------------------------------------------------------
-- 3. Missing private-group request table, if a database is behind V81.
-- ------------------------------------------------------------
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists group_join_requests_pending_uidx
  on public.group_join_requests(group_id,user_id)
  where status='pending';

create index if not exists group_join_requests_group_status_idx
  on public.group_join_requests(group_id,status,created_at desc);

create index if not exists group_join_requests_user_status_idx
  on public.group_join_requests(user_id,status,created_at desc);

alter table public.group_join_requests enable row level security;
grant select,insert on table public.group_join_requests to authenticated;

drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select
on public.group_join_requests
for select to authenticated
using (
  user_id=auth.uid()
  or exists (
    select 1 from public.groups as g
    where g.id=group_join_requests.group_id
      and g.owner_id=auth.uid()
  )
  or exists (
    select 1 from public.profiles as p
    where p.id=auth.uid() and coalesce(p.is_admin,false)
  )
);

drop policy if exists group_join_requests_insert on public.group_join_requests;
create policy group_join_requests_insert
on public.group_join_requests
for insert to authenticated
with check (
  user_id=auth.uid()
  and exists (
    select 1 from public.groups as g
    where g.id=group_join_requests.group_id
      and coalesce(g.deletion_status,'active') <> 'deleted'
  )
);

-- ------------------------------------------------------------
-- 4. Realtime publication additions, only when supported.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.page_followers') is not null
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_followers') then
    alter publication supabase_realtime add table public.page_followers;
  end if;
  if to_regclass('public.page_posts') is not null
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_posts') then
    alter publication supabase_realtime add table public.page_posts;
  end if;
  if to_regclass('public.page_post_reactions') is not null
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_post_reactions') then
    alter publication supabase_realtime add table public.page_post_reactions;
  end if;
  if to_regclass('public.page_post_comments') is not null
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_post_comments') then
    alter publication supabase_realtime add table public.page_post_comments;
  end if;
  if to_regclass('public.page_post_shares') is not null
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_post_shares') then
    alter publication supabase_realtime add table public.page_post_shares;
  end if;
end $$;

commit;
