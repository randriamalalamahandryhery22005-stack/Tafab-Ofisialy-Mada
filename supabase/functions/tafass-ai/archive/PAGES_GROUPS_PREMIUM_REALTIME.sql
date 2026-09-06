/* TAFAß — PAGES + GROUPES PREMIUM / REALTIME
   Safe/idempotent migration. No DROP TABLE / DELETE data. */

create table if not exists public.page_members (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check(role in ('owner','admin','editor')),
  created_at timestamptz not null default now(),
  unique(page_id,user_id)
);

create table if not exists public.page_post_reactions (
  id uuid primary key default gen_random_uuid(),
  page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default now(),
  unique(page_post_id,user_id)
);
create table if not exists public.page_post_comments (
  id uuid primary key default gen_random_uuid(),
  page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.group_post_reactions (
  id uuid primary key default gen_random_uuid(),
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like',
  created_at timestamptz not null default now(),
  unique(group_post_id,user_id)
);
create table if not exists public.group_post_comments (
  id uuid primary key default gen_random_uuid(),
  group_post_id uuid not null references public.group_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_messages (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.page_members enable row level security;
alter table public.page_post_reactions enable row level security;
alter table public.page_post_comments enable row level security;
alter table public.group_post_reactions enable row level security;
alter table public.group_post_comments enable row level security;
alter table public.page_messages enable row level security;
alter table public.group_messages enable row level security;

-- Reset only policy definitions; never touch rows.
do $$ declare r record; begin
  for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename in ('page_members','page_post_reactions','page_post_comments','group_post_reactions','group_post_comments','page_messages','group_messages') loop
    execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

-- Existing page/group post permissions are upgraded without replacing data.

-- Tighten Group membership: self-join/leave or owner/admin manages others.
drop policy if exists group_members_select on public.group_members;
drop policy if exists group_members_insert on public.group_members;
drop policy if exists group_members_delete on public.group_members;
create policy group_members_select on public.group_members for select to authenticated using(user_id=auth.uid() or public.tafa_is_group_member(group_id,auth.uid()) or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
create policy group_members_insert on public.group_members for insert to authenticated with check((user_id=auth.uid()) or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()) );
create policy group_members_delete on public.group_members for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));

-- Private group posts/chat are only visible to members; public groups remain discoverable.
drop policy if exists group_posts_select on public.group_posts;
create policy group_posts_select on public.group_posts for select to authenticated using(exists(select 1 from public.groups g where g.id=group_id and (g.privacy='public' or public.tafa_is_group_member(g.id,auth.uid()))));
drop policy if exists group_posts_insert on public.group_posts;
create policy group_posts_insert on public.group_posts for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));
drop policy if exists group_posts_update on public.group_posts;
create policy group_posts_update on public.group_posts for update to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
drop policy if exists group_posts_delete on public.group_posts;
create policy group_posts_delete on public.group_posts for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.groups g where g.id=group_id and g.owner_id=auth.uid()));
drop policy if exists page_posts_insert on public.page_posts;
create policy page_posts_insert on public.page_posts for insert to authenticated
  with check(user_id=auth.uid() and exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin','editor')));
drop policy if exists page_posts_select on public.page_posts;
create policy page_posts_select on public.page_posts for select to authenticated using(true);
drop policy if exists page_posts_update on public.page_posts;
create policy page_posts_update on public.page_posts for update to authenticated
  using(user_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin')));
drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_delete on public.page_posts for delete to authenticated
  using(user_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin')));

drop policy if exists page_members_select on public.page_members;
drop policy if exists page_members_insert on public.page_members;
drop policy if exists page_members_update on public.page_members;
drop policy if exists page_members_delete on public.page_members;
create policy page_members_select on public.page_members for select to authenticated using(true);
create policy page_members_insert on public.page_members for insert to authenticated with check(user_id=auth.uid() and (role='owner' or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())));
create policy page_members_update on public.page_members for update to authenticated using(exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));
create policy page_members_delete on public.page_members for delete to authenticated using(user_id=auth.uid() or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));

create policy page_post_reactions_select on public.page_post_reactions for select to authenticated using(true);
create policy page_post_reactions_insert on public.page_post_reactions for insert to authenticated with check(user_id=auth.uid());
create policy page_post_reactions_update on public.page_post_reactions for update to authenticated using(user_id=auth.uid());
create policy page_post_reactions_delete on public.page_post_reactions for delete to authenticated using(user_id=auth.uid());
create policy page_post_comments_select on public.page_post_comments for select to authenticated using(true);
create policy page_post_comments_insert on public.page_post_comments for insert to authenticated with check(user_id=auth.uid());
create policy page_post_comments_update on public.page_post_comments for update to authenticated using(user_id=auth.uid());
create policy page_post_comments_delete on public.page_post_comments for delete to authenticated using(user_id=auth.uid());

create policy group_post_reactions_select on public.group_post_reactions for select to authenticated using(true);
create policy group_post_reactions_insert on public.group_post_reactions for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member((select gp.group_id from public.group_posts gp where gp.id=group_post_id),auth.uid()));
create policy group_post_reactions_update on public.group_post_reactions for update to authenticated using(user_id=auth.uid());
create policy group_post_reactions_delete on public.group_post_reactions for delete to authenticated using(user_id=auth.uid());
create policy group_post_comments_select on public.group_post_comments for select to authenticated using(true);
create policy group_post_comments_insert on public.group_post_comments for insert to authenticated with check(user_id=auth.uid() and public.tafa_is_group_member((select gp.group_id from public.group_posts gp where gp.id=group_post_id),auth.uid()));
create policy group_post_comments_update on public.group_post_comments for update to authenticated using(user_id=auth.uid());
create policy group_post_comments_delete on public.group_post_comments for delete to authenticated using(user_id=auth.uid());

create policy page_messages_select on public.page_messages for select to authenticated using(sender_id=auth.uid() or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid()));
create policy page_messages_insert on public.page_messages for insert to authenticated with check(sender_id=auth.uid());
create policy group_messages_select on public.group_messages for select to authenticated using(public.tafa_is_group_member(group_id,auth.uid()));
create policy group_messages_insert on public.group_messages for insert to authenticated with check(sender_id=auth.uid() and public.tafa_is_group_member(group_id,auth.uid()));

-- Seed owner as Page owner/admin for every existing Page.
insert into public.page_members(page_id,user_id,role)
select id,owner_id,'owner' from public.pages
on conflict(page_id,user_id) do update set role='owner';

create index if not exists page_members_user_idx on public.page_members(user_id,page_id);
create index if not exists page_members_page_role_idx on public.page_members(page_id,role);
create index if not exists page_post_reactions_post_idx on public.page_post_reactions(page_post_id,created_at desc);
create index if not exists page_post_comments_post_idx on public.page_post_comments(page_post_id,created_at asc);
create index if not exists group_post_reactions_post_idx on public.group_post_reactions(group_post_id,created_at desc);
create index if not exists group_post_comments_post_idx on public.group_post_comments(group_post_id,created_at asc);
create index if not exists page_messages_page_created_idx on public.page_messages(page_id,created_at asc);
create index if not exists group_messages_group_created_idx on public.group_messages(group_id,created_at asc);

create or replace function public.tafa_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists tafa_page_post_comments_updated_at on public.page_post_comments;
create trigger tafa_page_post_comments_updated_at before update on public.page_post_comments for each row execute function public.tafa_set_updated_at();
drop trigger if exists tafa_group_post_comments_updated_at on public.group_post_comments;
create trigger tafa_group_post_comments_updated_at before update on public.group_post_comments for each row execute function public.tafa_set_updated_at();

-- Realtime, duplicate-safe.
do $$ declare t text; begin
  foreach t in array array['page_members','page_posts','page_post_reactions','page_post_comments','page_messages','group_posts','group_post_reactions','group_post_comments','group_messages'] loop
    execute format('alter table public.%I replica identity full',t);
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;
notify pgrst,'reload schema';
select 'TAFAß PAGES + GROUPES PREMIUM REALTIME READY' as status;
