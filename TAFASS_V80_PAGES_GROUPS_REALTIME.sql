-- Tafaß V80 — Pages & Groupes: suppression différée, rôles et realtime
create extension if not exists pg_cron;

alter table public.pages add column if not exists deletion_status text not null default 'active';
alter table public.pages add column if not exists deletion_requested_at timestamptz;
alter table public.pages add column if not exists deletion_scheduled_at timestamptz;

alter table public.groups add column if not exists deletion_status text not null default 'active';
alter table public.groups add column if not exists deletion_requested_at timestamptz;
alter table public.groups add column if not exists deletion_scheduled_at timestamptz;

create index if not exists pages_deletion_scheduled_idx on public.pages(deletion_status,deletion_scheduled_at);
create index if not exists groups_deletion_scheduled_idx on public.groups(deletion_status,deletion_scheduled_at);

create or replace function public.tafa_v80_is_platform_admin(p_uid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_uid and coalesce(p.is_admin,false)=true);
$$;

create or replace function public.tafa_v80_request_page_deletion(p_page_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_scheduled timestamptz;
begin
  select owner_id into v_owner from public.pages where id=p_page_id;
  if v_owner is null then raise exception 'Page introuvable'; end if;
  if v_owner<>auth.uid() and not public.tafa_v80_is_platform_admin(auth.uid()) then raise exception 'Accès refusé'; end if;
  v_scheduled=now()+interval '15 days';
  update public.pages set deletion_status='pending_deletion',deletion_requested_at=now(),deletion_scheduled_at=v_scheduled where id=p_page_id;
  return jsonb_build_object('success',true,'scheduled_at',v_scheduled);
end $$;

create or replace function public.tafa_v80_request_group_deletion(p_group_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_owner uuid; v_scheduled timestamptz;
begin
  select owner_id into v_owner from public.groups where id=p_group_id;
  if v_owner is null then raise exception 'Groupe introuvable'; end if;
  if v_owner<>auth.uid() and not public.tafa_v80_is_platform_admin(auth.uid()) then raise exception 'Accès refusé'; end if;
  v_scheduled=now()+interval '7 days';
  update public.groups set deletion_status='pending_deletion',deletion_requested_at=now(),deletion_scheduled_at=v_scheduled where id=p_group_id;
  return jsonb_build_object('success',true,'scheduled_at',v_scheduled);
end $$;

create or replace function public.tafa_v80_cancel_page_deletion(p_page_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.pages where id=p_page_id;
  if v_owner<>auth.uid() and not public.tafa_v80_is_platform_admin(auth.uid()) then raise exception 'Accès refusé'; end if;
  update public.pages set deletion_status='active',deletion_requested_at=null,deletion_scheduled_at=null where id=p_page_id;
  return true;
end $$;

create or replace function public.tafa_v80_cancel_group_deletion(p_group_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select owner_id into v_owner from public.groups where id=p_group_id;
  if v_owner<>auth.uid() and not public.tafa_v80_is_platform_admin(auth.uid()) then raise exception 'Accès refusé'; end if;
  update public.groups set deletion_status='active',deletion_requested_at=null,deletion_scheduled_at=null where id=p_group_id;
  return true;
end $$;

create or replace function public.tafa_v80_hard_delete_expired()
returns void language plpgsql security definer set search_path=public as $$
declare r record; t text;
begin
  for r in select id from public.pages where deletion_status='pending_deletion' and deletion_scheduled_at<=now() loop
    foreach t in array array['page_post_reactions','page_post_comments','page_post_shares','page_posts','page_messages','page_role_requests','page_followers','page_members','page_reports'] loop
      if to_regclass('public.'||t) is not null then execute format('delete from public.%I where page_id=$1',t) using r.id; end if;
    end loop;
    delete from public.pages where id=r.id;
  end loop;
  for r in select id from public.groups where deletion_status='pending_deletion' and deletion_scheduled_at<=now() loop
    foreach t in array array['group_post_reactions','group_post_comments','group_post_shares','group_posts','group_messages','group_role_requests','group_members'] loop
      if to_regclass('public.'||t) is not null then execute format('delete from public.%I where group_id=$1',t) using r.id; end if;
    end loop;
    delete from public.groups where id=r.id;
  end loop;
end $$;

create or replace function public.tafa_v80_platform_admin_set_role(p_kind text,p_entity_id uuid,p_user_id uuid,p_role text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.tafa_v80_is_platform_admin(auth.uid()) then raise exception 'Accès réservé à l’administrateur Tafaß'; end if;
  if p_role not in ('admin','editor','moderator') then raise exception 'Rôle invalide'; end if;
  if p_kind='page' then
    insert into public.page_members(page_id,user_id,role) values(p_entity_id,p_user_id,p_role)
    on conflict(page_id,user_id) do update set role=excluded.role;
  elsif p_kind='group' then
    insert into public.group_members(group_id,user_id,role) values(p_entity_id,p_user_id,p_role)
    on conflict(group_id,user_id) do update set role=excluded.role;
  else raise exception 'Type invalide'; end if;
  return true;
end $$;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pages') then alter publication supabase_realtime add table public.pages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='groups') then alter publication supabase_realtime add table public.groups; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_followers') then alter publication supabase_realtime add table public.page_followers; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='page_posts') then alter publication supabase_realtime add table public.page_posts; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_members') then alter publication supabase_realtime add table public.group_members; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='group_posts') then alter publication supabase_realtime add table public.group_posts; end if;
end $$;

-- Exécution automatique toutes les heures. Si pg_cron n'est pas disponible,
-- les fonctions restent appelables côté serveur.
do $$ begin
  if not exists(select 1 from cron.job where jobname='tafass_v80_entity_cleanup') then
    perform cron.schedule('tafass_v80_entity_cleanup','0 * * * *','select public.tafa_v80_hard_delete_expired()');
  end if;
exception when undefined_table then null; when insufficient_privilege then null; end $$;
