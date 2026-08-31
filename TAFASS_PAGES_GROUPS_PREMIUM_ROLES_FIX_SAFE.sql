-- TAFAß — Pages & Groupes premium roles / permissions / realtime
-- Safe migration: no DROP TABLE, no DELETE of existing data.

create or replace function public.tafa_is_page_admin(p_page_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.pages p where p.id=p_page_id and p.owner_id=p_user_id
  ) or exists (
    select 1 from public.page_members m
    where m.page_id=p_page_id and m.user_id=p_user_id and m.role in ('owner','admin')
  );
$$;

create or replace function public.tafa_is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.groups g where g.id=p_group_id and g.owner_id=p_user_id
  ) or exists (
    select 1 from public.group_members m
    where m.group_id=p_group_id and m.user_id=p_user_id and m.role='admin'
  );
$$;

grant execute on function public.tafa_is_page_admin(uuid,uuid) to authenticated;
grant execute on function public.tafa_is_group_admin(uuid,uuid) to authenticated;

-- Page management: owner + admins.
drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages for update to authenticated
using (public.tafa_is_page_admin(id, auth.uid()))
with check (public.tafa_is_page_admin(id, auth.uid()));

drop policy if exists pages_delete on public.pages;
create policy pages_delete on public.pages for delete to authenticated
using (owner_id=auth.uid());

-- Page team: owner + admins manage team; owner is protected.
drop policy if exists page_members_insert on public.page_members;
create policy page_members_insert on public.page_members for insert to authenticated
with check (
  (user_id=auth.uid() and role='owner' and exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()))
  or public.tafa_is_page_admin(page_id, auth.uid())
);

drop policy if exists page_members_update on public.page_members;
create policy page_members_update on public.page_members for update to authenticated
using (public.tafa_is_page_admin(page_id, auth.uid()))
with check (public.tafa_is_page_admin(page_id, auth.uid()) and role in ('owner','admin','editor'));

drop policy if exists page_members_delete on public.page_members;
create policy page_members_delete on public.page_members for delete to authenticated
using (
  user_id=auth.uid() or public.tafa_is_page_admin(page_id, auth.uid())
);

-- Only owner/admin may publish or moderate Page posts.
drop policy if exists page_posts_insert on public.page_posts;
create policy page_posts_insert on public.page_posts for insert to authenticated
with check (user_id=auth.uid() and public.tafa_is_page_admin(page_id, auth.uid()));

drop policy if exists page_posts_update on public.page_posts;
create policy page_posts_update on public.page_posts for update to authenticated
using (user_id=auth.uid() or public.tafa_is_page_admin(page_id, auth.uid()))
with check (user_id=auth.uid() or public.tafa_is_page_admin(page_id, auth.uid()));

drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_delete on public.page_posts for delete to authenticated
using (user_id=auth.uid() or public.tafa_is_page_admin(page_id, auth.uid()));

-- Page inbox: owner/admin can read; everyone can contact the Page.
drop policy if exists page_messages_select on public.page_messages;
create policy page_messages_select on public.page_messages for select to authenticated
using (sender_id=auth.uid() or public.tafa_is_page_admin(page_id, auth.uid()));

-- Page report table used by the UI.
create table if not exists public.page_reports (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'Page à vérifier',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
grant select, insert on public.page_reports to authenticated;
alter table public.page_reports enable row level security;
drop policy if exists page_reports_select on public.page_reports;
create policy page_reports_select on public.page_reports for select to authenticated
using (reporter_id=auth.uid() or public.tafa_is_page_admin(page_id,auth.uid()));
drop policy if exists page_reports_insert on public.page_reports;
create policy page_reports_insert on public.page_reports for insert to authenticated
with check (reporter_id=auth.uid());

-- Groups: public/private visibility stays intact; only admins can modify group metadata.
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
using (public.tafa_is_group_admin(id, auth.uid()))
with check (public.tafa_is_group_admin(id, auth.uid()));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated
using (owner_id=auth.uid());

-- Members can join themselves and invite another user; admins can manage roles/removals.
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members for insert to authenticated
with check (
  (user_id=auth.uid())
  or public.tafa_is_group_admin(group_id, auth.uid())
  or public.tafa_is_group_member(group_id, auth.uid())
);

drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members for update to authenticated
using (public.tafa_is_group_admin(group_id, auth.uid()))
with check (public.tafa_is_group_admin(group_id, auth.uid()));

drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members for delete to authenticated
using (user_id=auth.uid() or public.tafa_is_group_admin(group_id, auth.uid()));

-- Members can publish; only admins can moderate another member's post.
drop policy if exists group_posts_insert on public.group_posts;
create policy group_posts_insert on public.group_posts for insert to authenticated
with check (user_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));

drop policy if exists group_posts_update on public.group_posts;
create policy group_posts_update on public.group_posts for update to authenticated
using (user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid()))
with check (user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid()));

drop policy if exists group_posts_delete on public.group_posts;
create policy group_posts_delete on public.group_posts for delete to authenticated
using (user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid()));

-- Realtime / privileges for new report table and existing entity tables.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.page_reports to authenticated;

alter table public.page_reports replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.page_reports; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';
select 'TAFAß PAGE + GROUPE ROLES / PREMIUM UI READY' as status;
