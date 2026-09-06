-- TAFAß Pages & Groups: creation limits + role invitation workflow
create table if not exists public.page_role_requests (
 id uuid primary key default gen_random_uuid(), page_id uuid not null references public.pages(id) on delete cascade,
 target_user_id uuid not null references public.profiles(id) on delete cascade, requested_by uuid not null references public.profiles(id) on delete cascade,
 role text not null check(role in ('admin','editor','moderator')), status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), responded_at timestamptz, unique(page_id,target_user_id,role,status)
);
create table if not exists public.group_role_requests (
 id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
 target_user_id uuid not null references public.profiles(id) on delete cascade, requested_by uuid not null references public.profiles(id) on delete cascade,
 role text not null check(role in ('admin','moderator')), status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), responded_at timestamptz
);
alter table public.page_role_requests enable row level security; alter table public.group_role_requests enable row level security;
grant select,insert,update,delete on public.page_role_requests, public.group_role_requests to authenticated;
drop policy if exists page_role_req_select on public.page_role_requests; create policy page_role_req_select on public.page_role_requests for select to authenticated using(target_user_id=auth.uid() or requested_by=auth.uid());
drop policy if exists page_role_req_insert on public.page_role_requests; create policy page_role_req_insert on public.page_role_requests for insert to authenticated with check(requested_by=auth.uid());
drop policy if exists page_role_req_update on public.page_role_requests; create policy page_role_req_update on public.page_role_requests for update to authenticated using(target_user_id=auth.uid() or requested_by=auth.uid());
drop policy if exists group_role_req_select on public.group_role_requests; create policy group_role_req_select on public.group_role_requests for select to authenticated using(target_user_id=auth.uid() or requested_by=auth.uid());
drop policy if exists group_role_req_insert on public.group_role_requests; create policy group_role_req_insert on public.group_role_requests for insert to authenticated with check(requested_by=auth.uid());
drop policy if exists group_role_req_update on public.group_role_requests; create policy group_role_req_update on public.group_role_requests for update to authenticated using(target_user_id=auth.uid() or requested_by=auth.uid());
alter table public.page_role_requests replica identity full; alter table public.group_role_requests replica identity full;
do $$ begin
 begin alter publication supabase_realtime add table public.page_role_requests; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.group_role_requests; exception when duplicate_object then null; end;
end $$;

-- Enforce rolling 15-day creation limits server-side.
create or replace function public.tafa_can_create_page(p_user_id uuid default auth.uid()) returns boolean language sql security definer set search_path=public as $$
 select (select count(*) from public.pages where owner_id=p_user_id and created_at >= now()-interval '15 days') < 3;
$$;
create or replace function public.tafa_can_create_group(p_user_id uuid default auth.uid()) returns boolean language sql security definer set search_path=public as $$
 select (select count(*) from public.groups where owner_id=p_user_id and created_at >= now()-interval '15 days') < 5;
$$;
grant execute on function public.tafa_can_create_page(uuid), public.tafa_can_create_group(uuid) to authenticated;

-- Realtime notifications for role requests are delivered through notifications table.
notify pgrst, 'reload schema';
select 'TAFAß PAGE/GROUPE LIMITS + ROLE INVITES READY' as status;
