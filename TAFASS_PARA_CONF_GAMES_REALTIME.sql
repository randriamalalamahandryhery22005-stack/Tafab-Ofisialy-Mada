/* TAFAß — Connexions réelles + support Jeux intégrés
   Les jeux sont exécutés côté client et leurs records sont locaux.
   Les connexions externes restent dans connected_apps. */
create extension if not exists pgcrypto;
create table if not exists public.connected_apps (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 app_name text not null,
 provider text,
 status text not null default 'active' check(status in ('active','revoked')),
 connected_at timestamptz not null default now(),
 revoked_at timestamptz,
 metadata jsonb not null default '{}'::jsonb
);
create index if not exists connected_apps_user_status_idx on public.connected_apps(user_id,status,connected_at desc);
alter table public.connected_apps enable row level security;
drop policy if exists connected_apps_select on public.connected_apps;
drop policy if exists connected_apps_insert on public.connected_apps;
drop policy if exists connected_apps_update on public.connected_apps;
create policy connected_apps_select on public.connected_apps for select to authenticated using(user_id=auth.uid());
create policy connected_apps_insert on public.connected_apps for insert to authenticated with check(user_id=auth.uid());
create policy connected_apps_update on public.connected_apps for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table public.connected_apps replica identity full;
do $$ begin alter publication supabase_realtime add table public.connected_apps; exception when duplicate_object then null; end $$;
notify pgrst,'reload schema';
select 'TAFAß — CONNECTED_APPS REALTIME READY' as status;
