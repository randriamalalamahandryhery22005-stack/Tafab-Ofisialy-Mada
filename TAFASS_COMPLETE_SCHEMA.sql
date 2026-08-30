/* =========================================================
   TAFAß — COMPLETE SUPABASE REPAIR / V3
   Safe to re-run: no DROP TABLE, no DELETE data.
   Creates missing tables, fixes grants/RLS, and enables Realtime.
   ========================================================= */

create extension if not exists pgcrypto;

grant usage on schema public to anon, authenticated;

-- =========================================================
-- TABLES
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text default '', last_name text default '', username text unique,
  email text, birth date, gender text, country text, phone_code text, phone text,
  location text, bio text default '', avatar_url text, cover_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  content text default '', media_url text, media_type text, visibility text default 'public', location text,
  shares integer default 0, comments_count integer default 0, reactions_count integer default 0,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, reaction_type text not null,
  created_at timestamptz default now(), unique(post_id,user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, text text default '', content text default '',
  parent_id uuid references public.comments(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(), comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz default now(),
  unique(comment_id,user_id)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(), sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade, status text default 'pending',
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(sender_id,receiver_id), check(sender_id<>receiver_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz default now(),
  unique(user_id,friend_id), check(user_id<>friend_id)
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(), follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz default now(),
  unique(follower_id,following_id), check(follower_id<>following_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(), type text default 'private', name text,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz default now()
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, joined_at timestamptz default now(), unique(conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, content text default '', media_url text,
  media_type text, is_read boolean default false, created_at timestamptz default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade, type text not null, title text default '', message text default '',
  entity_type text default '', entity_id uuid, post_id uuid references public.posts(id) on delete cascade,
  is_read boolean default false, created_at timestamptz default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, description text default '', privacy text default 'public', cover_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, role text default 'member',
  created_at timestamptz default now(), unique(group_id,user_id)
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, username text unique, category text default 'Autre', bio text default '', logo_url text, cover_url text,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.page_followers (
  id uuid primary key default gen_random_uuid(), page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz default now(), unique(page_id,user_id)
);

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade, created_at timestamptz default now(), unique(user_id,post_id)
);

create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  search_text text not null, result_type text default 'all', created_at timestamptz default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade, theme text default 'system', language text default 'fr',
  profile_visibility text default 'public', allow_friend_requests boolean default true, allow_messages boolean default true,
  allow_search_by_phone boolean default true, allow_search_by_email boolean default true, notifications_enabled boolean default true,
  message_notifications boolean default true, friend_notifications boolean default true, reaction_notifications boolean default true,
  comment_notifications boolean default true, updated_at timestamptz default now()
);

create table if not exists public.activity_history (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null, description text default '', entity_type text default '', entity_id uuid, created_at timestamptz default now()
);

create table if not exists public.tafab_listings (
  id uuid primary key default gen_random_uuid(), seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text default '', category text default 'autre', price numeric(14,2), currency text default 'MGA',
  location text, phone text, image_url text, status text default 'active', created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.tafab_listing_messages (
  id uuid primary key default gen_random_uuid(), listing_id uuid not null references public.tafab_listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, message text not null, created_at timestamptz default now()
);

create table if not exists public.tafab_ads (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null, description text default '', image_url text, target_url text, status text default 'active',
  starts_at timestamptz default now(), ends_at timestamptz, created_at timestamptz default now()
);

-- Compatibility columns for older installations.
alter table public.posts add column if not exists location text;
alter table public.posts add column if not exists shares integer default 0;
alter table public.posts add column if not exists comments_count integer default 0;
alter table public.posts add column if not exists reactions_count integer default 0;
alter table public.posts add column if not exists updated_at timestamptz default now();
alter table public.comments add column if not exists text text default '';
alter table public.comments add column if not exists content text default '';
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
alter table public.comments add column if not exists updated_at timestamptz default now();

-- =========================================================
-- GRANTS: fixes PostgreSQL "permission denied for table ..."
-- RLS remains the security layer.
-- =========================================================

grant select on public.profiles to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select, update on all sequences in schema public to authenticated;

-- =========================================================
-- RPC used for phone -> email lookup before login.
-- This avoids exposing the whole profiles table to anon in the app.
-- =========================================================

create or replace function public.tafa_lookup_email_by_phone(p_phone text)
returns text
language sql
security definer
set search_path = public
as $$
  select email from public.profiles where phone = p_phone limit 1;
$$;

grant execute on function public.tafa_lookup_email_by_phone(text) to anon, authenticated;

-- =========================================================
-- AUTO PROFILE + SETTINGS AFTER AUTH SIGNUP
-- =========================================================

create or replace function public.tafa_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id,first_name,last_name,username,email,phone,phone_code,country,birth)
  values(
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    nullif(new.raw_user_meta_data->>'username',''),
    new.email,
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'phone_code',''),
    nullif(new.raw_user_meta_data->>'country',''),
    case when nullif(new.raw_user_meta_data->>'birth','') is null then null else (new.raw_user_meta_data->>'birth')::date end
  )
  on conflict(id) do update set email=excluded.email, updated_at=now();

  insert into public.user_settings(user_id)
  values(new.id)
  on conflict(user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tafa on auth.users;
create trigger on_auth_user_created_tafa
after insert on auth.users
for each row execute function public.tafa_handle_new_user();

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.follows enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.pages enable row level security;
alter table public.page_followers enable row level security;
alter table public.saved_posts enable row level security;
alter table public.search_history enable row level security;
alter table public.user_settings enable row level security;
alter table public.activity_history enable row level security;
alter table public.tafab_listings enable row level security;
alter table public.tafab_listing_messages enable row level security;
alter table public.tafab_ads enable row level security;

-- Remove EVERY existing policy on these tables, regardless of its old name.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in (
        'profiles','posts','post_reactions','comments','comment_likes','friend_requests','friendships','follows',
        'conversations','conversation_members','messages','notifications','groups','group_members','pages','page_followers',
        'saved_posts','search_history','user_settings','activity_history','tafab_listings','tafab_listing_messages','tafab_ads'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Profiles
create policy profiles_select on public.profiles for select to authenticated using(true);
create policy profiles_insert on public.profiles for insert to authenticated with check(id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());

-- Posts
create policy posts_select on public.posts for select to authenticated using(visibility='public' or user_id=auth.uid());
create policy posts_insert on public.posts for insert to authenticated with check(user_id=auth.uid());
create policy posts_update on public.posts for update to authenticated using(user_id=auth.uid());
create policy posts_delete on public.posts for delete to authenticated using(user_id=auth.uid());

-- Reactions
create policy reactions_select on public.post_reactions for select to authenticated using(true);
create policy reactions_insert on public.post_reactions for insert to authenticated with check(user_id=auth.uid());
create policy reactions_update on public.post_reactions for update to authenticated using(user_id=auth.uid());
create policy reactions_delete on public.post_reactions for delete to authenticated using(user_id=auth.uid());

-- Comments
create policy comments_select on public.comments for select to authenticated using(true);
create policy comments_insert on public.comments for insert to authenticated with check(user_id=auth.uid());
create policy comments_update on public.comments for update to authenticated using(user_id=auth.uid());
create policy comments_delete on public.comments for delete to authenticated using(user_id=auth.uid());

-- Comment likes
create policy comment_likes_select on public.comment_likes for select to authenticated using(true);
create policy comment_likes_insert on public.comment_likes for insert to authenticated with check(user_id=auth.uid());
create policy comment_likes_delete on public.comment_likes for delete to authenticated using(user_id=auth.uid());

-- Friends
create policy friend_requests_select on public.friend_requests for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy friend_requests_insert on public.friend_requests for insert to authenticated with check(sender_id=auth.uid());
create policy friend_requests_update on public.friend_requests for update to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy friend_requests_delete on public.friend_requests for delete to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
create policy friendships_select on public.friendships for select to authenticated using(user_id=auth.uid() or friend_id=auth.uid());
create policy friendships_insert on public.friendships for insert to authenticated with check(user_id=auth.uid() or friend_id=auth.uid());
create policy friendships_delete on public.friendships for delete to authenticated using(user_id=auth.uid() or friend_id=auth.uid());
create policy follows_select on public.follows for select to authenticated using(true);
create policy follows_insert on public.follows for insert to authenticated with check(follower_id=auth.uid());
create policy follows_delete on public.follows for delete to authenticated using(follower_id=auth.uid());

-- Messages
-- IMPORTANT: conversation_members policies must not query conversation_members directly,
-- otherwise PostgreSQL detects infinite RLS recursion. Use SECURITY DEFINER helpers.
create or replace function public.tafa_is_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
  );
$$;

create or replace function public.tafa_is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.group_members gm
    where gm.group_id = p_group_id
      and gm.user_id = p_user_id
  );
$$;

grant execute on function public.tafa_is_conversation_member(uuid,uuid) to authenticated;
grant execute on function public.tafa_is_group_member(uuid,uuid) to authenticated;

create policy conversations_select on public.conversations
for select to authenticated
using(created_by=auth.uid() or public.tafa_is_conversation_member(id, auth.uid()));
create policy conversations_insert on public.conversations
for insert to authenticated
with check(created_by=auth.uid());
create policy members_select on public.conversation_members
for select to authenticated
using(user_id=auth.uid() or public.tafa_is_conversation_member(conversation_id, auth.uid()));
create policy members_insert on public.conversation_members
for insert to authenticated
with check(user_id=auth.uid() or public.tafa_is_conversation_member(conversation_id, auth.uid()));
create policy members_delete on public.conversation_members
for delete to authenticated
using(user_id=auth.uid());
create policy messages_select on public.messages
for select to authenticated
using(sender_id=auth.uid() or public.tafa_is_conversation_member(conversation_id, auth.uid()));
create policy messages_insert on public.messages
for insert to authenticated
with check(sender_id=auth.uid() and public.tafa_is_conversation_member(conversation_id, auth.uid()));
create policy messages_update on public.messages
for update to authenticated
using(sender_id=auth.uid());

-- Notifications
create policy notifications_select on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check(actor_id=auth.uid() or user_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using(user_id=auth.uid());

-- Groups
create policy groups_select on public.groups for select to authenticated using(privacy='public' or owner_id=auth.uid());
create policy groups_insert on public.groups for insert to authenticated with check(owner_id=auth.uid());
create policy groups_update on public.groups for update to authenticated using(owner_id=auth.uid());
create policy groups_delete on public.groups for delete to authenticated using(owner_id=auth.uid());
create policy group_members_select on public.group_members
for select to authenticated
using(user_id=auth.uid() or public.tafa_is_group_member(group_id, auth.uid()));
create policy group_members_insert on public.group_members
for insert to authenticated
with check(user_id=auth.uid() or public.tafa_is_group_member(group_id, auth.uid()));
create policy group_members_delete on public.group_members
for delete to authenticated
using(user_id=auth.uid());

-- Pages
create policy pages_select on public.pages for select to authenticated using(true);
create policy pages_insert on public.pages for insert to authenticated with check(owner_id=auth.uid());
create policy pages_update on public.pages for update to authenticated using(owner_id=auth.uid());
create policy pages_delete on public.pages for delete to authenticated using(owner_id=auth.uid());
create policy page_followers_select on public.page_followers for select to authenticated using(true);
create policy page_followers_insert on public.page_followers for insert to authenticated with check(user_id=auth.uid());
create policy page_followers_delete on public.page_followers for delete to authenticated using(user_id=auth.uid());

-- Saved / Search / Settings / Activity
create policy saved_select on public.saved_posts for select to authenticated using(user_id=auth.uid());
create policy saved_insert on public.saved_posts for insert to authenticated with check(user_id=auth.uid());
create policy saved_delete on public.saved_posts for delete to authenticated using(user_id=auth.uid());
create policy search_select on public.search_history for select to authenticated using(user_id=auth.uid());
create policy search_insert on public.search_history for insert to authenticated with check(user_id=auth.uid());
create policy search_delete on public.search_history for delete to authenticated using(user_id=auth.uid());
create policy settings_select on public.user_settings for select to authenticated using(user_id=auth.uid());
create policy settings_insert on public.user_settings for insert to authenticated with check(user_id=auth.uid());
create policy settings_update on public.user_settings for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy activity_select on public.activity_history for select to authenticated using(user_id=auth.uid());
create policy activity_insert on public.activity_history for insert to authenticated with check(user_id=auth.uid());

-- Tafaß
create policy listings_select on public.tafab_listings for select to authenticated using(true);
create policy listings_insert on public.tafab_listings for insert to authenticated with check(seller_id=auth.uid());
create policy listings_update on public.tafab_listings for update to authenticated using(seller_id=auth.uid());
create policy listings_delete on public.tafab_listings for delete to authenticated using(seller_id=auth.uid());
create policy listing_messages_select on public.tafab_listing_messages for select to authenticated using(sender_id=auth.uid() or exists(select 1 from public.tafab_listings l where l.id=listing_id and l.seller_id=auth.uid()));
create policy listing_messages_insert on public.tafab_listing_messages for insert to authenticated with check(sender_id=auth.uid());
create policy ads_select on public.tafab_ads for select to authenticated using(status='active');
create policy ads_insert on public.tafab_ads for insert to authenticated with check(owner_id=auth.uid());
create policy ads_update on public.tafab_ads for update to authenticated using(owner_id=auth.uid());
create policy ads_delete on public.tafab_ads for delete to authenticated using(owner_id=auth.uid());

-- =========================================================
-- STORAGE — real media uploads for posts/profile
-- =========================================================
insert into storage.buckets (id, name, public)
values ('posts','posts',true)
on conflict (id) do update set public = true;

drop policy if exists tafa_posts_storage_select on storage.objects;
drop policy if exists tafa_posts_storage_insert on storage.objects;
drop policy if exists tafa_posts_storage_update on storage.objects;
drop policy if exists tafa_posts_storage_delete on storage.objects;

create policy tafa_posts_storage_select on storage.objects
for select to public
using(bucket_id='posts');

create policy tafa_posts_storage_insert on storage.objects
for insert to authenticated
with check(bucket_id='posts' and (storage.foldername(name))[1] = auth.uid()::text);

create policy tafa_posts_storage_update on storage.objects
for update to authenticated
using(bucket_id='posts' and owner_id::text = auth.uid()::text)
with check(bucket_id='posts' and owner_id::text = auth.uid()::text);

create policy tafa_posts_storage_delete on storage.objects
for delete to authenticated
using(bucket_id='posts' and owner_id::text = auth.uid()::text);

-- =========================================================
-- REALTIME
-- =========================================================

alter table public.profiles replica identity full;
alter table public.posts replica identity full;
alter table public.post_reactions replica identity full;
alter table public.comments replica identity full;
alter table public.comment_likes replica identity full;
alter table public.friend_requests replica identity full;
alter table public.friendships replica identity full;
alter table public.follows replica identity full;
alter table public.conversations replica identity full;
alter table public.conversation_members replica identity full;
alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.groups replica identity full;
alter table public.group_members replica identity full;
alter table public.pages replica identity full;
alter table public.page_followers replica identity full;
alter table public.saved_posts replica identity full;
alter table public.search_history replica identity full;
alter table public.user_settings replica identity full;
alter table public.activity_history replica identity full;
alter table public.tafab_listings replica identity full;
alter table public.tafab_listing_messages replica identity full;
alter table public.tafab_ads replica identity full;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','posts','post_reactions','comments','comment_likes','friend_requests','friendships','follows',
    'conversations','conversation_members','messages','notifications','groups','group_members','pages','page_followers',
    'saved_posts','search_history','user_settings','activity_history','tafab_listings','tafab_listing_messages','tafab_ads'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I',t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

notify pgrst, 'reload schema';
select 'TAFAß SUPABASE REPAIR V4 — RLS + MESSAGES + REALTIME READY' as status;

/* =========================================================
   TAFAß FINAL CONSOLIDATION — missing production objects
   Idempotent additions used by the final app build.
   ========================================================= */
create extension if not exists pgcrypto;

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  share_message text default '',
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create table if not exists public.blocked_profiles (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null default 'Compte à vérifier',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reporter_id,reported_id),
  check(reporter_id <> reported_id)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check(method in ('Airtel Money','Yas Money')),
  amount numeric(14,2) not null check(amount > 0),
  currency text not null default 'MGA',
  status text not null default 'pending' check(status in ('pending','paid','failed','cancelled')),
  external_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_transactions_user_created_idx on public.payment_transactions(user_id,created_at desc);
create unique index if not exists payment_transactions_one_pending_idx on public.payment_transactions(user_id,method,amount) where status='pending';

alter table public.profiles add column if not exists city_current text;
alter table public.profiles add column if not exists city_origin text;
alter table public.profiles add column if not exists name_changed_at timestamptz;

alter table public.post_shares enable row level security;
alter table public.blocked_profiles enable row level security;
alter table public.profile_reports enable row level security;
alter table public.payment_transactions enable row level security;

drop policy if exists post_shares_select on public.post_shares;
drop policy if exists post_shares_insert on public.post_shares;
create policy post_shares_select on public.post_shares for select to authenticated using(true);
create policy post_shares_insert on public.post_shares for insert to authenticated with check(user_id=auth.uid());

drop policy if exists blocked_select on public.blocked_profiles;
drop policy if exists blocked_insert on public.blocked_profiles;
drop policy if exists blocked_delete on public.blocked_profiles;
create policy blocked_select on public.blocked_profiles for select to authenticated using(blocker_id=auth.uid() or blocked_id=auth.uid());
create policy blocked_insert on public.blocked_profiles for insert to authenticated with check(blocker_id=auth.uid());
create policy blocked_delete on public.blocked_profiles for delete to authenticated using(blocker_id=auth.uid());

drop policy if exists profile_reports_select on public.profile_reports;
drop policy if exists profile_reports_insert on public.profile_reports;
create policy profile_reports_select on public.profile_reports for select to authenticated using(reporter_id=auth.uid());
create policy profile_reports_insert on public.profile_reports for insert to authenticated with check(reporter_id=auth.uid());

drop policy if exists payment_transactions_select on public.payment_transactions;
drop policy if exists payment_transactions_insert on public.payment_transactions;
create policy payment_transactions_select on public.payment_transactions for select to authenticated using(user_id=auth.uid());
create policy payment_transactions_insert on public.payment_transactions for insert to authenticated with check(user_id=auth.uid());

create or replace function public.tafa_is_blocked(a uuid,b uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.blocked_profiles where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
grant execute on function public.tafa_is_blocked(uuid,uuid) to authenticated;

create or replace function public.tafa_mark_conversation_read(p_conversation_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.tafa_is_conversation_member(p_conversation_id,auth.uid()) then raise exception 'Conversation inaccessible'; end if;
  update public.messages set is_read=true where conversation_id=p_conversation_id and sender_id<>auth.uid() and is_read=false;
  get diagnostics n=row_count;
  return n;
end;
$$;
grant execute on function public.tafa_mark_conversation_read(uuid) to authenticated;

create or replace function public.tafa_common_friend_counts(p_user_ids uuid[])
returns table(user_id uuid,common_count bigint)
language sql stable security definer set search_path=public as $$
  select target.user_id,count(*)::bigint
  from public.friendships target
  join public.friendships mine on mine.friend_id=target.friend_id and mine.user_id=auth.uid()
  where target.user_id=any(p_user_ids) and target.user_id<>auth.uid()
  group by target.user_id;
$$;
grant execute on function public.tafa_common_friend_counts(uuid[]) to authenticated;

create or replace function public.tafa_complete_oauth_profile(
  p_first_name text,p_last_name text,p_email text,p_birth date,p_gender text,
  p_phone text,p_country text,p_city_current text,p_city_origin text
) returns public.profiles language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); result public.profiles; auth_email text;
begin
  if uid is null then raise exception 'TAFAß_AUTH_REQUIRED: Session Supabase invalide.'; end if;
  auth_email:=nullif(auth.jwt()->>'email','');
  if auth_email is null then auth_email:=nullif(trim(p_email),''); end if;
  if coalesce(trim(p_first_name),'')='' or coalesce(trim(p_last_name),'')='' or p_birth is null
     or coalesce(trim(p_gender),'')='' or coalesce(trim(p_phone),'')='' or coalesce(trim(p_country),'')=''
     or coalesce(trim(p_city_current),'')='' or coalesce(trim(p_city_origin),'')='' then
    raise exception 'TAFAß_PROFILE_INCOMPLETE: Toutes les informations obligatoires sont requises.';
  end if;
  if p_birth>current_date then raise exception 'TAFAß_INVALID_BIRTH: Date de naissance invalide.'; end if;
  if extract(year from age(current_date,p_birth))<13 then raise exception 'TAFAß_AGE_REQUIRED: Vous devez avoir au moins 13 ans.'; end if;
  insert into public.profiles(id,first_name,last_name,email,birth,gender,phone,country,city_current,city_origin,updated_at)
  values(uid,trim(p_first_name),trim(p_last_name),auth_email,p_birth,trim(p_gender),trim(p_phone),trim(p_country),trim(p_city_current),trim(p_city_origin),now())
  on conflict(id) do update set first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,birth=excluded.birth,
    gender=excluded.gender,phone=excluded.phone,country=excluded.country,city_current=excluded.city_current,city_origin=excluded.city_origin,updated_at=now()
  returning * into result;
  return result;
end;
$$;
revoke all on function public.tafa_complete_oauth_profile(text,text,text,date,text,text,text,text,text) from public;
grant execute on function public.tafa_complete_oauth_profile(text,text,text,date,text,text,text,text,text) to authenticated;

/* Realtime additions: duplicate publication errors are intentionally ignored. */
do $$
declare t text;
begin
  foreach t in array array['post_shares','blocked_profiles','profile_reports','payment_transactions'] loop
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;

alter table public.post_shares replica identity full;
alter table public.blocked_profiles replica identity full;
alter table public.profile_reports replica identity full;
alter table public.payment_transactions replica identity full;
