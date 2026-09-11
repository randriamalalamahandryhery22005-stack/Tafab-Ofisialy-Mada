-- ============================================================
-- Tafaß V81 — SOCIAL ACTIONS / FIXED
-- Page Follow + Group Membership + Private Group Join Requests
-- Run AFTER V80.
--
-- Fixes:
-- 1) Creates the missing group_join_requests table safely.
-- 2) Adds RLS/grants/indexes for that table.
-- 3) Makes V81 RPCs safe on an already partially migrated database.
-- 4) Keeps realtime additions idempotent.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Private-group join requests
-- ------------------------------------------------------------
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.group_join_requests
  add column if not exists group_id uuid;

alter table public.group_join_requests
  add column if not exists user_id uuid;

alter table public.group_join_requests
  add column if not exists status text;

alter table public.group_join_requests
  add column if not exists created_at timestamptz;

alter table public.group_join_requests
  add column if not exists updated_at timestamptz;

-- Only add defaults where the column can safely accept them.
alter table public.group_join_requests
  alter column status set default 'pending';

alter table public.group_join_requests
  alter column created_at set default now();

alter table public.group_join_requests
  alter column updated_at set default now();

-- Normalize null legacy values before enforcing NOT NULL.
update public.group_join_requests
set status='pending'
where status is null or trim(status)='';

update public.group_join_requests
set created_at=now()
where created_at is null;

update public.group_join_requests
set updated_at=coalesce(created_at,now())
where updated_at is null;

-- These constraints are created only when the referenced columns are
-- available. V81's normal schema already has both FK targets.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.group_join_requests'::regclass
      and contype='f'
      and conname='group_join_requests_group_id_fkey'
  ) then
    alter table public.group_join_requests
      add constraint group_join_requests_group_id_fkey
      foreign key (group_id) references public.groups(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid='public.group_join_requests'::regclass
      and contype='f'
      and conname='group_join_requests_user_id_fkey'
  ) then
    alter table public.group_join_requests
      add constraint group_join_requests_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

alter table public.group_join_requests
  alter column group_id set not null,
  alter column user_id set not null,
  alter column status set not null,
  alter column created_at set not null,
  alter column updated_at set not null;

-- One pending request per user/group. A user may request again after a
-- previous request is no longer pending.
create unique index if not exists group_join_requests_pending_uidx
  on public.group_join_requests(group_id,user_id)
  where status='pending';

create index if not exists group_join_requests_group_status_idx
  on public.group_join_requests(group_id,status,created_at desc);

create index if not exists group_join_requests_user_status_idx
  on public.group_join_requests(user_id,status,created_at desc);

alter table public.group_join_requests enable row level security;

grant select, insert on table public.group_join_requests to authenticated;

drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select
on public.group_join_requests
for select
to authenticated
using (
  user_id=auth.uid()
  or exists (
    select 1
    from public.groups as g
    where g.id=group_join_requests.group_id
      and g.owner_id=auth.uid()
  )
  or coalesce(public.tafa_v80_is_platform_admin(auth.uid()),false)
);

drop policy if exists group_join_requests_insert on public.group_join_requests;
create policy group_join_requests_insert
on public.group_join_requests
for insert
to authenticated
with check (
  user_id=auth.uid()
  and exists (
    select 1
    from public.groups as g
    where g.id=group_join_requests.group_id
      and coalesce(g.deletion_status,'active') <> 'deleted'
  )
);

-- ------------------------------------------------------------
-- 2. Page follow RPC
-- ------------------------------------------------------------
create or replace function public.tafa_v81_toggle_page_follow(p_page_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_row_id uuid;
  v_is_followed boolean;
begin
  if v_uid is null then
    raise exception 'Authentification requise.';
  end if;

  select p.owner_id
    into v_owner_id
  from public.pages as p
  where p.id=p_page_id
    and coalesce(p.deletion_status,'active') <> 'deleted';

  if v_owner_id is null then
    raise exception 'Page introuvable.';
  end if;

  if v_owner_id=v_uid then
    raise exception 'Le propriétaire ne peut pas suivre sa propre Page.';
  end if;

  select f.id
    into v_row_id
  from public.page_followers as f
  where f.page_id=p_page_id
    and f.user_id=v_uid
  limit 1;

  if v_row_id is not null then
    delete from public.page_followers as f
    where f.id=v_row_id;
    v_is_followed:=false;
  else
    insert into public.page_followers(page_id,user_id)
    values(p_page_id,v_uid)
    on conflict(page_id,user_id) do nothing;

    v_is_followed:=exists (
      select 1
      from public.page_followers as f
      where f.page_id=p_page_id
        and f.user_id=v_uid
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'followed',v_is_followed
  );
end;
$$;

-- ------------------------------------------------------------
-- 3. Private/public group join request RPC
-- ------------------------------------------------------------
create or replace function public.tafa_v81_request_group_join(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_privacy text;
  v_existing_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentification requise.';
  end if;

  select g.owner_id,coalesce(g.privacy,'public')
    into v_owner_id,v_privacy
  from public.groups as g
  where g.id=p_group_id
    and coalesce(g.deletion_status,'active') <> 'deleted';

  if v_owner_id is null then
    raise exception 'Groupe introuvable.';
  end if;

  if v_owner_id=v_uid then
    raise exception 'Le propriétaire est déjà membre de son propre groupe.';
  end if;

  if lower(trim(v_privacy)) <> 'private' then
    insert into public.group_members(group_id,user_id,role)
    values(p_group_id,v_uid,'member')
    on conflict(group_id,user_id) do nothing;

    return jsonb_build_object(
      'success',true,
      'joined',true,
      'requested',false
    );
  end if;

  select r.id
    into v_existing_id
  from public.group_join_requests as r
  where r.group_id=p_group_id
    and r.user_id=v_uid
    and r.status='pending'
  limit 1;

  if v_existing_id is not null then
    return jsonb_build_object(
      'success',true,
      'requested',true,
      'already_requested',true
    );
  end if;

  insert into public.group_join_requests(group_id,user_id,status)
  values(p_group_id,v_uid,'pending')
  on conflict (group_id,user_id) where status='pending' do nothing;

  return jsonb_build_object(
    'success',true,
    'requested',true,
    'already_requested',false
  );
end;
$$;

-- ------------------------------------------------------------
-- 4. Group membership toggle RPC
-- ------------------------------------------------------------
create or replace function public.tafa_v81_toggle_group_membership(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner_id uuid;
  v_privacy text;
  v_row_id uuid;
  v_is_joined boolean;
begin
  if v_uid is null then
    raise exception 'Authentification requise.';
  end if;

  select g.owner_id,coalesce(g.privacy,'public')
    into v_owner_id,v_privacy
  from public.groups as g
  where g.id=p_group_id
    and coalesce(g.deletion_status,'active') <> 'deleted';

  if v_owner_id is null then
    raise exception 'Groupe introuvable.';
  end if;

  select gm.id
    into v_row_id
  from public.group_members as gm
  where gm.group_id=p_group_id
    and gm.user_id=v_uid
  limit 1;

  if v_row_id is not null then
    if v_owner_id=v_uid then
      raise exception 'Le propriétaire ne peut pas quitter son propre groupe.';
    end if;

    delete from public.group_members as gm
    where gm.id=v_row_id;

    v_is_joined:=false;
  else
    if lower(trim(v_privacy))='private' then
      return jsonb_build_object(
        'success',true,
        'joined',false,
        'requested',true
      );
    end if;

    insert into public.group_members(group_id,user_id,role)
    values(p_group_id,v_uid,'member')
    on conflict(group_id,user_id) do nothing;

    v_is_joined:=exists (
      select 1
      from public.group_members as gm
      where gm.group_id=p_group_id
        and gm.user_id=v_uid
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'joined',v_is_joined
  );
end;
$$;

revoke all on function public.tafa_v81_toggle_page_follow(uuid) from public;
revoke all on function public.tafa_v81_request_group_join(uuid) from public;
revoke all on function public.tafa_v81_toggle_group_membership(uuid) from public;

grant execute on function public.tafa_v81_toggle_page_follow(uuid) to authenticated;
grant execute on function public.tafa_v81_request_group_join(uuid) to authenticated;
grant execute on function public.tafa_v81_toggle_group_membership(uuid) to authenticated;

-- ------------------------------------------------------------
-- 5. Realtime, idempotent
-- ------------------------------------------------------------
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles',
    'friend_requests',
    'friendships',
    'follows',
    'pages',
    'page_followers',
    'groups',
    'group_members',
    'group_join_requests'
  ] loop
    if to_regclass('public.'||v_table) is not null then
      execute format(
        'alter table public.%I replica identity full',
        v_table
      );

      if not exists (
        select 1
        from pg_publication_tables
        where pubname='supabase_realtime'
          and schemaname='public'
          and tablename=v_table
      ) then
        begin
          execute format(
            'alter publication supabase_realtime add table public.%I',
            v_table
          );
        exception
          when duplicate_object then null;
          when undefined_object then null;
          when insufficient_privilege then null;
        end;
      end if;
    end if;
  end loop;
end $$;

commit;
