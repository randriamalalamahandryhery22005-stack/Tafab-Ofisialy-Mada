-- TAFAß PAGES + GROUPES PREMIUM COMPLETE V3
-- Permissions: Page publication = propriétaire uniquement.
-- Page administration = propriétaire + administrateurs.
-- Groupe publication = membre; modifications/gestion = propriétaire + administrateurs.
-- Safe to re-run. No DROP TABLE / DELETE DATA.

begin;

-- Privileges for authenticated users on the feature tables.
grant usage on schema public to authenticated;
grant select,insert,update,delete on table
  public.page_members, public.page_posts, public.page_post_reactions,
  public.page_post_comments, public.page_post_shares, public.page_messages,
  public.group_members, public.group_posts, public.group_post_reactions,
  public.group_post_comments, public.group_post_shares, public.group_messages
  to authenticated;

grant select,insert,delete on table public.page_followers to authenticated;
grant select,insert on table public.notifications to authenticated;
grant select,insert,update on table public.pages to authenticated;
grant select,insert,update,delete on table public.groups to authenticated;

-- Helper: group administrator / owner.
create or replace function public.tafa_is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.groups g
    where g.id=p_group_id and g.owner_id=p_user_id
  ) or exists (
    select 1 from public.group_members m
    where m.group_id=p_group_id and m.user_id=p_user_id and m.role='admin'
  );
$$;

grant execute on function public.tafa_is_group_admin(uuid,uuid) to authenticated;

-- =========================
-- PAGES
-- =========================
alter table public.pages enable row level security;
alter table public.page_members enable row level security;
alter table public.page_posts enable row level security;
alter table public.page_post_reactions enable row level security;
alter table public.page_post_comments enable row level security;
alter table public.page_post_shares enable row level security;
alter table public.page_followers enable row level security;
alter table public.page_messages enable row level security;

drop policy if exists pages_update on public.pages;
create policy pages_update on public.pages for update to authenticated
using (
  owner_id=auth.uid()
  or exists(select 1 from public.page_members m where m.page_id=id and m.user_id=auth.uid() and m.role='admin')
)
with check (true);

drop policy if exists page_members_insert on public.page_members;
drop policy if exists page_members_update on public.page_members;
drop policy if exists page_members_delete on public.page_members;
create policy page_members_insert on public.page_members for insert to authenticated
with check (
  (user_id=auth.uid() and role='owner')
  or exists(select 1 from public.pages p where p.id=page_id and (p.owner_id=auth.uid() or exists(select 1 from public.page_members a where a.page_id=p.id and a.user_id=auth.uid() and a.role='admin')))
);
create policy page_members_update on public.page_members for update to authenticated
using (
  exists(select 1 from public.pages p where p.id=page_id and (p.owner_id=auth.uid() or exists(select 1 from public.page_members a where a.page_id=p.id and a.user_id=auth.uid() and a.role='admin')))
)
with check (true);
create policy page_members_delete on public.page_members for delete to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.pages p where p.id=page_id and (p.owner_id=auth.uid() or exists(select 1 from public.page_members a where a.page_id=p.id and a.user_id=auth.uid() and a.role='admin')))
);

-- Only the Page owner can publish as the Page.
drop policy if exists page_posts_insert on public.page_posts;
create policy page_posts_insert on public.page_posts for insert to authenticated
with check (
  user_id=auth.uid()
  and exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())
);

drop policy if exists page_posts_update on public.page_posts;
drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_update on public.page_posts for update to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.pages p where p.id=page_id and (p.owner_id=auth.uid() or exists(select 1 from public.page_members a where a.page_id=p.id and a.user_id=auth.uid() and a.role='admin')))
)
with check (true);
create policy page_posts_delete on public.page_posts for delete to authenticated
using (
  user_id=auth.uid()
  or exists(select 1 from public.pages p where p.id=page_id and (p.owner_id=auth.uid() or exists(select 1 from public.page_members a where a.page_id=p.id and a.user_id=auth.uid() and a.role='admin')))
);

-- =========================
-- GROUPES
-- =========================
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_posts enable row level security;
alter table public.group_post_reactions enable row level security;
alter table public.group_post_comments enable row level security;
alter table public.group_post_shares enable row level security;
alter table public.group_messages enable row level security;

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
using(public.tafa_is_group_admin(id,auth.uid()))
with check (true);

drop policy if exists group_members_update on public.group_members;
drop policy if exists group_members_delete on public.group_members;
create policy group_members_update on public.group_members for update to authenticated
using(public.tafa_is_group_admin(group_id,auth.uid())) with check(true);
create policy group_members_delete on public.group_members for delete to authenticated
using(user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid()));

drop policy if exists group_posts_update on public.group_posts;
drop policy if exists group_posts_delete on public.group_posts;
create policy group_posts_update on public.group_posts for update to authenticated
using(user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid())) with check(true);
create policy group_posts_delete on public.group_posts for delete to authenticated
using(user_id=auth.uid() or public.tafa_is_group_admin(group_id,auth.uid()));

-- Realtime, idempotent.
DO $$
declare t text;
begin
  foreach t in array array[
    'pages','page_members','page_followers','page_posts','page_post_reactions','page_post_comments','page_post_shares','page_messages',
    'groups','group_members','group_posts','group_post_reactions','group_post_comments','group_post_shares','group_messages'
  ] loop
    begin
      execute format('alter table public.%I replica identity full',t);
      execute format('alter publication supabase_realtime add table public.%I',t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

commit;

select 'TAFAß PAGES + GROUPES PREMIUM V3 PERMISSIONS READY' as status;
