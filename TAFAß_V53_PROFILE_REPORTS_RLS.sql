-- Tafaß V53 — PROFILE REPORTS RLS HOTFIX
-- Fixes: new row violates row-level security policy for table "profile_reports"
-- Run once in Supabase SQL Editor. Safe for an existing table.

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Contenu à vérifier',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.profile_reports enable row level security;

-- Remove conflicting policies, then install the minimum secure policies.
drop policy if exists profile_reports_select_own on public.profile_reports;
drop policy if exists profile_reports_insert_own on public.profile_reports;
drop policy if exists profile_reports_update_own on public.profile_reports;
drop policy if exists profile_reports_delete_own on public.profile_reports;

create policy profile_reports_select_own
on public.profile_reports
for select
to authenticated
using (reporter_id = auth.uid());

create policy profile_reports_insert_own
on public.profile_reports
for insert
to authenticated
with check (reporter_id = auth.uid() and reported_id <> auth.uid());

-- Reports are submitted once and are not editable/deletable by users.
-- Administration should continue to use the existing secure admin RPCs.

grant select, insert on public.profile_reports to authenticated;

-- Optional realtime support if the table is already in the database.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='profile_reports'
  ) then
    begin
      alter publication supabase_realtime add table public.profile_reports;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';
