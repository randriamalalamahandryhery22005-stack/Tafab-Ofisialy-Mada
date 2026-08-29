-- =========================================================
-- TAFAß — DATABASE COMPLETE V1
-- Projet vaovao / tables vaovao
-- Supabase PostgreSQL
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  username text unique,
  email text,
  birth date,
  gender text,
  country text,
  phone_code text,
  phone text,
  location text,
  bio text default '',
  avatar_url text,
  cover_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- POSTS ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  media_type text check (media_type in ('image','video','reel') or media_type is null),
  visibility text not null default 'public'
    check (visibility in ('public','friends','private')),
  shares integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- POST REACTIONS ----------
create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (
    reaction_type in ('J’aime','J’adore','Solidaire','Haha','Waouh','Triste','En colère')
  ),
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

-- ---------- COMMENTS ----------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  text text not null default '',
  content text not null default '',
  parent_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- COMMENT LIKES ----------
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(comment_id,user_id)
);

-- ---------- FRIEND REQUESTS ----------
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(sender_id,receiver_id)
);

-- ---------- FRIENDSHIPS ----------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,friend_id),
  check(user_id <> friend_id)
);

-- ---------- FOLLOWS ----------
create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(follower_id,following_id),
  check(follower_id <> following_id)
);

-- ---------- NOTIFICATIONS ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null,
  title text default '',
  message text default '',
  entity_type text default '',
  entity_id uuid,
  post_id uuid references public.posts(id) on delete cascade,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- MESSAGES ----------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'private'
    check(type in ('private','group')),
  name text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique(conversation_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  media_type text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- PAGES ----------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  username text unique,
  category text default 'Autre',
  bio text default '',
  logo_url text,
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.page_followers (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(page_id,user_id)
);

-- ---------- GROUPS ----------
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text default '',
  privacy text not null default 'public'
    check(privacy in ('public','private')),
  cover_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member'
    check(role in ('member','moderator','admin')),
  created_at timestamptz not null default now(),
  unique(group_id,user_id)
);

-- ---------- SAVED ----------
create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id,post_id)
);

-- ---------- INDEXES ----------
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists reactions_post_idx on public.post_reactions(post_id);
create index if not exists comments_post_idx on public.comments(post_id);
create index if not exists notifications_user_idx on public.notifications(user_id,created_at desc);
create index if not exists messages_conversation_idx on public.messages(conversation_id,created_at);
create index if not exists profiles_username_idx on public.profiles(username);

-- ---------- AUTO PROFILE ----------
create or replace function public.tafa_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, username, email
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    nullif(new.raw_user_meta_data->>'username',''),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_tafa on auth.users;
create trigger on_auth_user_created_tafa
after insert on auth.users
for each row execute function public.tafa_handle_new_user();

-- ---------- REACTION RPC ----------
create or replace function public.tafa_set_post_reaction(
  p_post_id uuid,
  p_reaction_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecté';
  end if;

  if p_reaction_type not in ('J’aime','J’adore','Solidaire','Haha','Waouh','Triste','En colère') then
    raise exception 'Réaction invalide';
  end if;

  if exists (
    select 1 from public.post_reactions
    where post_id=p_post_id and user_id=auth.uid()
      and reaction_type=p_reaction_type
  ) then
    delete from public.post_reactions
    where post_id=p_post_id and user_id=auth.uid();
  else
    insert into public.post_reactions(post_id,user_id,reaction_type)
    values(p_post_id,auth.uid(),p_reaction_type)
    on conflict(post_id,user_id)
    do update set reaction_type=excluded.reaction_type,created_at=now();
  end if;
end;
$$;

-- ---------- SHARE RPC ----------
create or replace function public.tafa_increment_post_share(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecté';
  end if;
  update public.posts
  set shares=shares+1,updated_at=now()
  where id=p_post_id;
end;
$$;

grant execute on function public.tafa_set_post_reaction(uuid,text) to authenticated;
grant execute on function public.tafa_increment_post_share(uuid) to authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.pages enable row level security;
alter table public.page_followers enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.saved_posts enable row level security;

-- Simple policies for the new project.
-- Drop/recreate so this script can safely be rerun.
do $$
declare r record;
begin
  for r in
    select schemaname,tablename,policyname
    from pg_policies
    where schemaname='public'
      and tablename in (
        'profiles','posts','post_reactions','comments','comment_likes',
        'friend_requests','friendships','follows','notifications',
        'conversations','conversation_members','messages',
        'pages','page_followers','groups','group_members','saved_posts'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
      r.policyname,r.schemaname,r.tablename);
  end loop;
end $$;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy posts_select on public.posts for select to authenticated using (visibility='public' or user_id=auth.uid());
create policy posts_insert on public.posts for insert to authenticated with check (user_id=auth.uid());
create policy posts_update on public.posts for update to authenticated using (user_id=auth.uid());
create policy posts_delete on public.posts for delete to authenticated using (user_id=auth.uid());

create policy reactions_select on public.post_reactions for select to authenticated using (true);
create policy reactions_insert on public.post_reactions for insert to authenticated with check (user_id=auth.uid());
create policy reactions_update on public.post_reactions for update to authenticated using (user_id=auth.uid());
create policy reactions_delete on public.post_reactions for delete to authenticated using (user_id=auth.uid());

create policy comments_select on public.comments for select to authenticated using (true);
create policy comments_insert on public.comments for insert to authenticated with check (user_id=auth.uid());
create policy comments_update on public.comments for update to authenticated using (user_id=auth.uid());
create policy comments_delete on public.comments for delete to authenticated using (user_id=auth.uid());

create policy comment_likes_all on public.comment_likes for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy friend_requests_select on public.friend_requests for select to authenticated
using (sender_id=auth.uid() or receiver_id=auth.uid());
create policy friend_requests_insert on public.friend_requests for insert to authenticated
with check (sender_id=auth.uid());
create policy friend_requests_update on public.friend_requests for update to authenticated
using (receiver_id=auth.uid() or sender_id=auth.uid());
create policy friend_requests_delete on public.friend_requests for delete to authenticated
using (receiver_id=auth.uid() or sender_id=auth.uid());

create policy friendships_select on public.friendships for select to authenticated using (user_id=auth.uid() or friend_id=auth.uid());
create policy friendships_insert on public.friendships for insert to authenticated with check (user_id=auth.uid() or friend_id=auth.uid());
create policy friendships_delete on public.friendships for delete to authenticated using (user_id=auth.uid() or friend_id=auth.uid());

create policy follows_all on public.follows for all to authenticated
using (follower_id=auth.uid() or following_id=auth.uid())
with check (follower_id=auth.uid());

create policy notifications_select on public.notifications for select to authenticated using (user_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id=auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated with check (actor_id=auth.uid() or user_id=auth.uid());

create policy conversations_select on public.conversations for select to authenticated
using (created_by=auth.uid() or exists(select 1 from public.conversation_members m where m.conversation_id=id and m.user_id=auth.uid()));
create policy conversations_insert on public.conversations for insert to authenticated with check (created_by=auth.uid());

create policy members_select on public.conversation_members for select to authenticated
using (user_id=auth.uid() or exists(select 1 from public.conversation_members x where x.conversation_id=conversation_id and x.user_id=auth.uid()));
create policy members_insert on public.conversation_members for insert to authenticated with check (user_id=auth.uid());

create policy messages_select on public.messages for select to authenticated
using (sender_id=auth.uid() or exists(select 1 from public.conversation_members m where m.conversation_id=messages.conversation_id and m.user_id=auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
with check (sender_id=auth.uid());

create policy pages_select on public.pages for select to authenticated using (true);
create policy pages_insert on public.pages for insert to authenticated with check (owner_id=auth.uid());
create policy pages_update on public.pages for update to authenticated using (owner_id=auth.uid());
create policy pages_delete on public.pages for delete to authenticated using (owner_id=auth.uid());

create policy page_followers_all on public.page_followers for all to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy groups_select on public.groups for select to authenticated using (privacy='public' or owner_id=auth.uid());
create policy groups_insert on public.groups for insert to authenticated with check (owner_id=auth.uid());
create policy groups_update on public.groups for update to authenticated using (owner_id=auth.uid());
create policy groups_delete on public.groups for delete to authenticated using (owner_id=auth.uid());

create policy group_members_select on public.group_members for select to authenticated using (user_id=auth.uid());
create policy group_members_insert on public.group_members for insert to authenticated with check (user_id=auth.uid());
create policy group_members_delete on public.group_members for delete to authenticated using (user_id=auth.uid());

create policy saved_select on public.saved_posts for select to authenticated using (user_id=auth.uid());
create policy saved_insert on public.saved_posts for insert to authenticated with check (user_id=auth.uid());
create policy saved_delete on public.saved_posts for delete to authenticated using (user_id=auth.uid());

-- ---------- REALTIME ----------
do $$
begin
  begin alter publication supabase_realtime add table public.posts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_reactions; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.friend_requests; exception when duplicate_object then null; end;
end $$;

notify pgrst, 'reload schema';

select 'TAFAß NEW PROJECT DATABASE READY' as status;
