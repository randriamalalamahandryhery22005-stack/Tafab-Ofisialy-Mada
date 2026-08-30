/* TAFAß — PAGES + GROUPES PREMIUM COMPLETE / REALTIME
   Safe/idempotent. Does not DROP tables or delete rows. Run after the principal schema.
*/

-- Core feature tables
create table if not exists public.page_members (
  id uuid primary key default gen_random_uuid(), page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role text not null default 'editor' check(role in ('owner','admin','editor')),
  created_at timestamptz not null default now(), unique(page_id,user_id)
);
create table if not exists public.page_posts (
  id uuid primary key default gen_random_uuid(), page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '', media_url text, media_type text,
  visibility text not null default 'public', reactions_count integer not null default 0, comments_count integer not null default 0,
  shares_count integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.page_post_reactions (
  id uuid primary key default gen_random_uuid(), page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, reaction_type text not null default 'like', created_at timestamptz not null default now(), unique(page_post_id,user_id)
);
create table if not exists public.page_post_comments (
  id uuid primary key default gen_random_uuid(), page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.page_post_shares (
  id uuid primary key default gen_random_uuid(), page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, share_message text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.page_messages (
  id uuid primary key default gen_random_uuid(), page_id uuid not null references public.pages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, message text not null default '', created_at timestamptz not null default now()
);

create table if not exists public.group_posts (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '', media_url text, media_type text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.group_post_reactions (
  id uuid primary key default gen_random_uuid(), group_post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, reaction_type text not null default 'like', created_at timestamptz not null default now(), unique(group_post_id,user_id)
);
create table if not exists public.group_post_comments (
  id uuid primary key default gen_random_uuid(), group_post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, content text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.group_post_shares (
  id uuid primary key default gen_random_uuid(), group_post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, share_message text not null default '', created_at timestamptz not null default now()
);
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, message text not null default '', created_at timestamptz not null default now()
);

-- PostgreSQL privileges: required before RLS is evaluated.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.page_members,public.page_posts,public.page_post_reactions,public.page_post_comments,public.page_post_shares,public.page_messages to authenticated;
grant select,insert,update,delete on public.group_members,public.group_posts,public.group_post_reactions,public.group_post_comments,public.group_post_shares,public.group_messages to authenticated;
grant select,insert,update,delete on public.pages,public.groups to authenticated;

-- RLS
alter table public.page_members enable row level security; alter table public.page_posts enable row level security;
alter table public.page_post_reactions enable row level security; alter table public.page_post_comments enable row level security; alter table public.page_post_shares enable row level security; alter table public.page_messages enable row level security;
alter table public.group_members enable row level security; alter table public.group_posts enable row level security; alter table public.group_post_reactions enable row level security; alter table public.group_post_comments enable row level security; alter table public.group_post_shares enable row level security; alter table public.group_messages enable row level security;

-- Page manager policies
 drop policy if exists page_members_select on public.page_members; drop policy if exists page_members_insert on public.page_members; drop policy if exists page_members_update on public.page_members; drop policy if exists page_members_delete on public.page_members;
create policy page_members_select on public.page_members for select to authenticated using(true);
create policy page_members_insert on public.page_members for insert to authenticated with check(user_id=auth.uid() and (role='owner' or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())));
create policy page_members_update on public.page_members for update to authenticated using(exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));
create policy page_members_delete on public.page_members for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));

-- Page posts
 drop policy if exists page_posts_select on public.page_posts; drop policy if exists page_posts_insert on public.page_posts; drop policy if exists page_posts_update on public.page_posts; drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_select on public.page_posts for select to authenticated using(visibility='public' or exists(select 1 from public.page_members m where m.page_id=page_id and m.user_id=auth.uid()));
create policy page_posts_insert on public.page_posts for insert to authenticated with check(user_id=auth.uid() and exists(select 1 from public.page_members m where m.page_id=page_id and m.user_id=auth.uid() and m.role in('owner','admin','editor')));
create policy page_posts_update on public.page_posts for update to authenticated using(user_id=auth.uid() or exists(select 1 from public.page_members m where m.page_id=page_id and m.user_id=auth.uid() and m.role in('owner','admin')));
create policy page_posts_delete on public.page_posts for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.page_members m where m.page_id=page_id and m.user_id=auth.uid() and m.role in('owner','admin')));

-- Page engagement
 drop policy if exists page_post_reactions_select on public.page_post_reactions; drop policy if exists page_post_reactions_insert on public.page_post_reactions; drop policy if exists page_post_reactions_update on public.page_post_reactions; drop policy if exists page_post_reactions_delete on public.page_post_reactions;
create policy page_post_reactions_select on public.page_post_reactions for select to authenticated using(true); create policy page_post_reactions_insert on public.page_post_reactions for insert to authenticated with check(user_id=auth.uid()); create policy page_post_reactions_update on public.page_post_reactions for update to authenticated using(user_id=auth.uid()); create policy page_post_reactions_delete on public.page_post_reactions for delete to authenticated using(user_id=auth.uid());
 drop policy if exists page_post_comments_select on public.page_post_comments; drop policy if exists page_post_comments_insert on public.page_post_comments; drop policy if exists page_post_comments_update on public.page_post_comments; drop policy if exists page_post_comments_delete on public.page_post_comments;
create policy page_post_comments_select on public.page_post_comments for select to authenticated using(true); create policy page_post_comments_insert on public.page_post_comments for insert to authenticated with check(user_id=auth.uid()); create policy page_post_comments_update on public.page_post_comments for update to authenticated using(user_id=auth.uid()); create policy page_post_comments_delete on public.page_post_comments for delete to authenticated using(user_id=auth.uid());
 drop policy if exists page_post_shares_select on public.page_post_shares; drop policy if exists page_post_shares_insert on public.page_post_shares;
create policy page_post_shares_select on public.page_post_shares for select to authenticated using(true); create policy page_post_shares_insert on public.page_post_shares for insert to authenticated with check(user_id=auth.uid());

-- Page messages
 drop policy if exists page_messages_select on public.page_messages; drop policy if exists page_messages_insert on public.page_messages;
create policy page_messages_select on public.page_messages for select to authenticated using(sender_id=auth.uid() or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));
create policy page_messages_insert on public.page_messages for insert to authenticated with check(sender_id=auth.uid());

-- Groups
 drop policy if exists group_members_select on public.group_members; drop policy if exists group_members_insert on public.group_members; drop policy if exists group_members_update on public.group_members; drop policy if exists group_members_delete on public.group_members;
create policy group_members_select on public.group_members for select to authenticated using(user_id=auth.uid() or public.tafa_is_group_member(group_id,auth.uid()) or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy group_members_insert on public.group_members for insert to authenticated with check(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy group_members_update on public.group_members for update to authenticated using(exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy group_members_delete on public.group_members for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
 drop policy if exists group_posts_select on public.group_posts; drop policy if exists group_posts_insert on public.group_posts; drop policy if exists group_posts_update on public.group_posts; drop policy if exists group_posts_delete on public.group_posts;
create policy group_posts_select on public.group_posts for select to authenticated using(exists(select 1 from public.groups g where g.id=group_id and (g.privacy='public' or public.tafa_is_group_member(g.id,auth.uid()))));
create policy group_posts_insert on public.group_posts for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));
create policy group_posts_update on public.group_posts for update to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy group_posts_delete on public.group_posts for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));

-- Group engagement
 drop policy if exists group_post_reactions_select on public.group_post_reactions; drop policy if exists group_post_reactions_insert on public.group_post_reactions; drop policy if exists group_post_reactions_update on public.group_post_reactions; drop policy if exists group_post_reactions_delete on public.group_post_reactions;
create policy group_post_reactions_select on public.group_post_reactions for select to authenticated using(true); create policy group_post_reactions_insert on public.group_post_reactions for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member((select group_id from public.group_posts where id=group_post_id),auth.uid())); create policy group_post_reactions_update on public.group_post_reactions for update to authenticated using(user_id=auth.uid()); create policy group_post_reactions_delete on public.group_post_reactions for delete to authenticated using(user_id=auth.uid());
 drop policy if exists group_post_comments_select on public.group_post_comments; drop policy if exists group_post_comments_insert on public.group_post_comments; drop policy if exists group_post_comments_update on public.group_post_comments; drop policy if exists group_post_comments_delete on public.group_post_comments;
create policy group_post_comments_select on public.group_post_comments for select to authenticated using(true); create policy group_post_comments_insert on public.group_post_comments for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member((select group_id from public.group_posts where id=group_post_id),auth.uid())); create policy group_post_comments_update on public.group_post_comments for update to authenticated using(user_id=auth.uid()); create policy group_post_comments_delete on public.group_post_comments for delete to authenticated using(user_id=auth.uid());
 drop policy if exists group_post_shares_select on public.group_post_shares; drop policy if exists group_post_shares_insert on public.group_post_shares;
create policy group_post_shares_select on public.group_post_shares for select to authenticated using(true); create policy group_post_shares_insert on public.group_post_shares for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member((select group_id from public.group_posts where id=group_post_id),auth.uid()));

-- Group chat
 drop policy if exists group_messages_select on public.group_messages; drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_select on public.group_messages for select to authenticated using(public.tafa_is_group_member(group_id,auth.uid()));
create policy group_messages_insert on public.group_messages for insert to authenticated with check(sender_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));

-- Existing Page owners become owners in page_members
insert into public.page_members(page_id,user_id,role) select id,owner_id,'owner' from public.pages on conflict(page_id,user_id) do update set role='owner';

-- Updated-at helper
create or replace function public.tafa_pages_groups_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists tafa_page_posts_updated_at on public.page_posts; create trigger tafa_page_posts_updated_at before update on public.page_posts for each row execute function public.tafa_pages_groups_updated_at();
drop trigger if exists tafa_group_posts_updated_at on public.group_posts; create trigger tafa_group_posts_updated_at before update on public.group_posts for each row execute function public.tafa_pages_groups_updated_at();
drop trigger if exists tafa_page_comments_updated_at on public.page_post_comments; create trigger tafa_page_comments_updated_at before update on public.page_post_comments for each row execute function public.tafa_pages_groups_updated_at();
drop trigger if exists tafa_group_comments_updated_at on public.group_post_comments; create trigger tafa_group_comments_updated_at before update on public.group_post_comments for each row execute function public.tafa_pages_groups_updated_at();

-- Indexes
create index if not exists page_posts_page_created_idx on public.page_posts(page_id,created_at desc); create index if not exists page_post_reactions_post_idx on public.page_post_reactions(page_post_id,created_at desc); create index if not exists page_post_comments_post_idx on public.page_post_comments(page_post_id,created_at asc); create index if not exists page_post_shares_post_idx on public.page_post_shares(page_post_id,created_at desc);
create index if not exists group_posts_group_created_idx on public.group_posts(group_id,created_at desc); create index if not exists group_post_reactions_post_idx on public.group_post_reactions(group_post_id,created_at desc); create index if not exists group_post_comments_post_idx on public.group_post_comments(group_post_id,created_at asc); create index if not exists group_post_shares_post_idx on public.group_post_shares(group_post_id,created_at desc);

-- Realtime: duplicate-safe
 do $$ declare t text; begin foreach t in array array['page_members','page_posts','page_post_reactions','page_post_comments','page_post_shares','page_messages','page_followers','group_members','group_posts','group_post_reactions','group_post_comments','group_post_shares','group_messages'] loop execute format('alter table public.%I replica identity full',t); begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end; end loop; end $$;
notify pgrst,'reload schema';
select 'TAFAß PAGES + GROUPES PREMIUM COMPLETE REALTIME READY' as status;
