-- Tafaß — BLOCKED PROFILES RLS FIX
-- Fixes: new row violates row-level security policy (USING expression)
-- Cause: Supabase/PostgREST upsert may require UPDATE policy on conflict.
-- Safe/additive: does not delete or modify existing blocked_profiles rows.

alter table public.blocked_profiles enable row level security;

drop policy if exists blocked_select on public.blocked_profiles;
drop policy if exists blocked_insert on public.blocked_profiles;
drop policy if exists blocked_update on public.blocked_profiles;
drop policy if exists blocked_delete on public.blocked_profiles;

create policy blocked_select
on public.blocked_profiles
for select to authenticated
using (blocker_id = auth.uid() or blocked_id = auth.uid());

create policy blocked_insert
on public.blocked_profiles
for insert to authenticated
with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

create policy blocked_update
on public.blocked_profiles
for update to authenticated
using (blocker_id = auth.uid())
with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

create policy blocked_delete
on public.blocked_profiles
for delete to authenticated
using (blocker_id = auth.uid());

-- Required grants for the authenticated client.
grant select, insert, update, delete on public.blocked_profiles to authenticated;
