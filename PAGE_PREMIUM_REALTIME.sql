/* ================================================================
   TAFAß — PAGE PREMIUM REALTIME v2
   Page only. Safe/idempotent: no DROP TABLE, no DELETE data.
   Requires: TAFASS_FINAL_COMPLETE_REALTIME.sql
   ================================================================ */

create extension if not exists pgcrypto;

-- Production Page profile fields
alter table public.pages add column if not exists contact_email text;
alter table public.pages add column if not exists contact_phone text;
alter table public.pages add column if not exists website_url text;
alter table public.pages add column if not exists address text;
alter table public.pages add column if not exists country text default 'Madagascar';
alter table public.pages add column if not exists verification_status text default 'official';
alter table public.pages add column if not exists status text default 'active';

-- Page managers / roles
create table if not exists public.page_members (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'editor' check(role in ('owner','admin','editor')),
  created_at timestamptz not null default now(),
  unique(page_id,user_id)
);

-- Page publications
create table if not exists public.page_posts (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  media_type text,
  visibility text not null default 'public',
  reactions_count bigint not null default 0,
  comments_count bigint not null default 0,
  shares_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.page_posts add column if not exists visibility text default 'public';
alter table public.page_posts add column if not exists reactions_count bigint default 0;
alter table public.page_posts add column if not exists comments_count bigint default 0;
alter table public.page_posts add column if not exists shares_count bigint default 0;
alter table public.page_posts add column if not exists updated_at timestamptz default now();

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

create table if not exists public.page_post_shares (
  id uuid primary key default gen_random_uuid(),
  page_post_id uuid not null references public.page_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_message text not null default '',
  created_at timestamptz not null default now(),
  unique(page_post_id,user_id)
);

-- Page inbox / contact
create table if not exists public.page_messages (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null default '',
  media_url text,
  media_type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.page_messages add column if not exists media_url text;
alter table public.page_messages add column if not exists media_type text;
alter table public.page_messages add column if not exists is_read boolean default false;

-- Security
-- PostgreSQL table privileges (RLS is still enforced below).
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.page_members, public.page_posts, public.page_post_reactions, public.page_post_comments, public.page_post_shares, public.page_messages to authenticated;
grant select, insert, delete on table public.page_followers to authenticated;

alter table public.page_members enable row level security;
alter table public.page_posts enable row level security;
alter table public.page_post_reactions enable row level security;
alter table public.page_post_comments enable row level security;
alter table public.page_post_shares enable row level security;
alter table public.page_messages enable row level security;

-- Page followers: re-create only its policies, never rows.
drop policy if exists page_followers_select on public.page_followers;
drop policy if exists page_followers_insert on public.page_followers;
drop policy if exists page_followers_delete on public.page_followers;
create policy page_followers_select on public.page_followers for select to authenticated using(true);
create policy page_followers_insert on public.page_followers for insert to authenticated with check(user_id=auth.uid());
create policy page_followers_delete on public.page_followers for delete to authenticated using(user_id=auth.uid());

-- Managers
 drop policy if exists page_members_select on public.page_members;
drop policy if exists page_members_insert on public.page_members;
drop policy if exists page_members_update on public.page_members;
drop policy if exists page_members_delete on public.page_members;
create policy page_members_select on public.page_members for select to authenticated using(true);
create policy page_members_insert on public.page_members for insert to authenticated with check(
  (user_id=auth.uid() and role='owner')
  or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())
);
create policy page_members_update on public.page_members for update to authenticated using(
  exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())
);
create policy page_members_delete on public.page_members for delete to authenticated using(
  user_id=auth.uid() or exists(select 1 from public.pages p where p.id=page_id and p.owner_id=auth.uid())
);

-- Publications: owner/admin/editor may publish. Owner/admin may moderate.
drop policy if exists page_posts_select on public.page_posts;
drop policy if exists page_posts_insert on public.page_posts;
drop policy if exists page_posts_update on public.page_posts;
drop policy if exists page_posts_delete on public.page_posts;
create policy page_posts_select on public.page_posts for select to authenticated using(visibility='public' or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid()));
create policy page_posts_insert on public.page_posts for insert to authenticated with check(
  user_id=auth.uid() and exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin','editor'))
);
create policy page_posts_update on public.page_posts for update to authenticated using(
  user_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin'))
);
create policy page_posts_delete on public.page_posts for delete to authenticated using(
  user_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin'))
);

-- Engagement
 drop policy if exists page_post_reactions_select on public.page_post_reactions;
drop policy if exists page_post_reactions_insert on public.page_post_reactions;
drop policy if exists page_post_reactions_update on public.page_post_reactions;
drop policy if exists page_post_reactions_delete on public.page_post_reactions;
create policy page_post_reactions_select on public.page_post_reactions for select to authenticated using(true);
create policy page_post_reactions_insert on public.page_post_reactions for insert to authenticated with check(user_id=auth.uid());
create policy page_post_reactions_update on public.page_post_reactions for update to authenticated using(user_id=auth.uid());
create policy page_post_reactions_delete on public.page_post_reactions for delete to authenticated using(user_id=auth.uid());

drop policy if exists page_post_comments_select on public.page_post_comments;
drop policy if exists page_post_comments_insert on public.page_post_comments;
drop policy if exists page_post_comments_update on public.page_post_comments;
drop policy if exists page_post_comments_delete on public.page_post_comments;
create policy page_post_comments_select on public.page_post_comments for select to authenticated using(true);
create policy page_post_comments_insert on public.page_post_comments for insert to authenticated with check(user_id=auth.uid());
create policy page_post_comments_update on public.page_post_comments for update to authenticated using(user_id=auth.uid());
create policy page_post_comments_delete on public.page_post_comments for delete to authenticated using(user_id=auth.uid());

drop policy if exists page_post_shares_select on public.page_post_shares;
drop policy if exists page_post_shares_insert on public.page_post_shares;
create policy page_post_shares_select on public.page_post_shares for select to authenticated using(true);
create policy page_post_shares_insert on public.page_post_shares for insert to authenticated with check(user_id=auth.uid());

-- Inbox: visitor sends; Page owner/admin reads and replies.
drop policy if exists page_messages_select on public.page_messages;
drop policy if exists page_messages_insert on public.page_messages;
drop policy if exists page_messages_update on public.page_messages;
create policy page_messages_select on public.page_messages for select to authenticated using(
  sender_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin'))
);
create policy page_messages_insert on public.page_messages for insert to authenticated with check(sender_id=auth.uid());
create policy page_messages_update on public.page_messages for update to authenticated using(
  sender_id=auth.uid() or exists(select 1 from public.page_members pm where pm.page_id=page_id and pm.user_id=auth.uid() and pm.role in ('owner','admin'))
);

-- Seed owner as owner for every existing Page.
insert into public.page_members(page_id,user_id,role)
select id,owner_id,'owner' from public.pages
on conflict(page_id,user_id) do update set role='owner';

-- Counters stay truthful and realtime.
create or replace function public.tafa_page_sync_counts()
returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
  pid:=coalesce(new.page_post_id,old.page_post_id);
  update public.page_posts p set
    reactions_count=(select count(*) from public.page_post_reactions r where r.page_post_id=pid),
    comments_count=(select count(*) from public.page_post_comments c where c.page_post_id=pid),
    shares_count=(select count(*) from public.page_post_shares s where s.page_post_id=pid)
  where p.id=pid;
  return coalesce(new,old);
end; $$;

drop trigger if exists tafa_page_reaction_counts on public.page_post_reactions;
create trigger tafa_page_reaction_counts after insert or update or delete on public.page_post_reactions for each row execute function public.tafa_page_sync_counts();
drop trigger if exists tafa_page_comment_counts on public.page_post_comments;
create trigger tafa_page_comment_counts after insert or update or delete on public.page_post_comments for each row execute function public.tafa_page_sync_counts();
drop trigger if exists tafa_page_share_counts on public.page_post_shares;
create trigger tafa_page_share_counts after insert or update or delete on public.page_post_shares for each row execute function public.tafa_page_sync_counts();

drop trigger if exists tafa_page_posts_updated_at on public.page_posts;
create trigger tafa_page_posts_updated_at before update on public.page_posts for each row execute function public.tafa_set_updated_at();
drop trigger if exists tafa_page_post_comments_updated_at on public.page_post_comments;
create trigger tafa_page_post_comments_updated_at before update on public.page_post_comments for each row execute function public.tafa_set_updated_at();

-- Realtime publication, duplicate-safe.
do $$ declare t text; begin
  foreach t in array array['page_members','page_posts','page_post_reactions','page_post_comments','page_post_shares','page_messages','page_followers'] loop
    execute format('alter table public.%I replica identity full',t);
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;

-- Helpful indexes
create index if not exists page_members_page_role_idx on public.page_members(page_id,role);
create index if not exists page_members_user_idx on public.page_members(user_id,page_id);
create index if not exists page_posts_page_created_idx on public.page_posts(page_id,created_at desc);
create index if not exists page_posts_user_created_idx on public.page_posts(user_id,created_at desc);
create index if not exists page_post_reactions_post_idx on public.page_post_reactions(page_post_id,created_at desc);
create index if not exists page_post_comments_post_idx on public.page_post_comments(page_post_id,created_at asc);
create index if not exists page_post_shares_post_idx on public.page_post_shares(page_post_id,created_at desc);
create index if not exists page_messages_page_created_idx on public.page_messages(page_id,created_at asc);
create index if not exists page_followers_page_idx on public.page_followers(page_id,created_at desc);

notify pgrst,'reload schema';
select 'TAFAß PAGE PREMIUM REALTIME v2 READY' as status;
