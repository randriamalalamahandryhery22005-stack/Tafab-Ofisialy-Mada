/* =========================================================
   TAFAß V12 — REAL SOCIAL / REALTIME
   - Real profile actions: friend, message, report, block
   - Real A <-> B messaging + read state RPC
   - Automatic realtime alerts for reactions/comments/shares/friends/messages
   - Real search/activity/payment records
   - No seed data is inserted
   ========================================================= */

create extension if not exists pgcrypto;

create table if not exists public.post_shares (id uuid primary key default gen_random_uuid(), post_id uuid not null references public.posts(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, share_message text default '', created_at timestamptz not null default now(), unique(post_id,user_id));

-- =========================================================
-- PROFILE MODERATION / BLOCKING
-- =========================================================
create table if not exists public.blocked_profiles (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_id),
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
  unique(reporter_id, reported_id),
  check(reporter_id <> reported_id)
);

alter table public.blocked_profiles enable row level security;
alter table public.profile_reports enable row level security;

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

create or replace function public.tafa_is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1 from public.blocked_profiles
    where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a)
  );
$$;
grant execute on function public.tafa_is_blocked(uuid,uuid) to authenticated;

-- Prevent new interactions between blocked accounts.
drop policy if exists friend_requests_insert on public.friend_requests;
create policy friend_requests_insert on public.friend_requests
for insert to authenticated
with check(sender_id=auth.uid() and not public.tafa_is_blocked(sender_id, receiver_id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
for insert to authenticated
with check(created_by=auth.uid());

-- =========================================================
-- MESSAGES: READ RECEIPTS WITHOUT OPENING A BROAD UPDATE POLICY
-- =========================================================
drop policy if exists messages_update on public.messages;

create or replace function public.tafa_mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.tafa_is_conversation_member(p_conversation_id, auth.uid()) then
    raise exception 'Conversation inaccessible';
  end if;
  update public.messages
     set is_read=true
   where conversation_id=p_conversation_id
     and sender_id<>auth.uid()
     and is_read=false;
  get diagnostics n=row_count;
  return n;
end;
$$;
grant execute on function public.tafa_mark_conversation_read(uuid) to authenticated;

-- =========================================================
-- PAYMENT RECORDS: ONLY REAL DATABASE TRANSACTIONS ARE SHOWN
-- =========================================================
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
alter table public.payment_transactions enable row level security;
drop policy if exists payment_select on public.payment_transactions;
drop policy if exists payment_insert on public.payment_transactions;
create policy payment_select on public.payment_transactions for select to authenticated using(user_id=auth.uid());
create policy payment_insert on public.payment_transactions for insert to authenticated with check(user_id=auth.uid());

-- =========================================================
-- AUTOMATIC ALERTS — THE DATABASE IS THE SOURCE OF TRUTH
-- =========================================================
create or replace function public.tafa_notify(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_entity_type text default '',
  p_entity_id uuid default null,
  p_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare cfg public.user_settings;
begin
  if p_user_id is null or p_actor_id is null or p_user_id=p_actor_id then return; end if;
  select * into cfg from public.user_settings where user_id=p_user_id;
  if coalesce(cfg.notifications_enabled,true)=false then return; end if;
  if p_type='message' and coalesce(cfg.message_notifications,true)=false then return; end if;
  if p_type='friend_request' and coalesce(cfg.friend_notifications,true)=false then return; end if;
  if p_type='reaction' and coalesce(cfg.reaction_notifications,true)=false then return; end if;
  if p_type='comment' and coalesce(cfg.comment_notifications,true)=false then return; end if;
  insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,post_id,is_read)
  values(p_user_id,p_actor_id,p_type,p_title,p_message,p_entity_type,p_entity_id,p_post_id,false);
end;
$$;

create or replace function public.tafa_notify_reaction()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  perform public.tafa_notify(owner_id,new.user_id,'reaction','Nouvelle réaction','Un membre a réagi à votre publication.','post',new.post_id,new.post_id);
  return new;
end; $$;

drop trigger if exists tafa_notify_reaction_trigger on public.post_reactions;
create trigger tafa_notify_reaction_trigger after insert or update on public.post_reactions for each row execute function public.tafa_notify_reaction();

create or replace function public.tafa_notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  perform public.tafa_notify(owner_id,new.user_id,'comment','Nouveau commentaire','Un membre a commenté votre publication.','post',new.post_id,new.post_id);
  return new;
end; $$;

drop trigger if exists tafa_notify_comment_trigger on public.comments;
create trigger tafa_notify_comment_trigger after insert on public.comments for each row execute function public.tafa_notify_comment();

create or replace function public.tafa_notify_share()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  perform public.tafa_notify(owner_id,new.user_id,'share','Nouvelle partage','Un membre a partagé votre publication.','post',new.post_id,new.post_id);
  return new;
end; $$;

drop trigger if exists tafa_notify_share_trigger on public.post_shares;
create trigger tafa_notify_share_trigger after insert or update on public.post_shares for each row execute function public.tafa_notify_share();

create or replace function public.tafa_notify_friend_request()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' then
    perform public.tafa_notify(new.receiver_id,new.sender_id,'friend_request','Nouvelle demande d’ami','Vous avez reçu une nouvelle demande d’ami.','friend_request',new.id,null);
  elsif new.status='accepted' and tg_op='UPDATE' and old.status is distinct from 'accepted' then
    perform public.tafa_notify(new.sender_id,new.receiver_id,'friend_accepted','Demande acceptée','Votre demande d’ami a été acceptée.','friend_request',new.id,null);
  end if;
  return new;
end; $$;

drop trigger if exists tafa_notify_friend_request_trigger on public.friend_requests;
create trigger tafa_notify_friend_request_trigger after insert or update of status on public.friend_requests for each row execute function public.tafa_notify_friend_request();

create or replace function public.tafa_notify_message()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  for recipient in
    select user_id from public.conversation_members
    where conversation_id=new.conversation_id and user_id<>new.sender_id
  loop
    perform public.tafa_notify(recipient,new.sender_id,'message','Nouveau message','Vous avez reçu un nouveau message.','conversation',new.conversation_id,null);
  end loop;
  return new;
end; $$;

drop trigger if exists tafa_notify_message_trigger on public.messages;
create trigger tafa_notify_message_trigger after insert on public.messages for each row execute function public.tafa_notify_message();

-- Keep post counters synchronized from the real tables.
create or replace function public.tafa_sync_comment_count()
returns trigger language plpgsql security definer set search_path=public as $$
declare pid uuid;
begin
  pid=coalesce(new.post_id,old.post_id);
  update public.posts set comments_count=(select count(*) from public.comments where post_id=pid),updated_at=now() where id=pid;
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists tafa_sync_comment_count_trigger on public.comments;
create trigger tafa_sync_comment_count_trigger after insert or update or delete on public.comments for each row execute function public.tafa_sync_comment_count();

create or replace function public.tafa_notify_follow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.tafa_notify(new.following_id,new.follower_id,'follow','Nouvel abonnement','Un membre vous suit maintenant.','profile',new.follower_id,null);
  return new;
end; $$;
drop trigger if exists tafa_notify_follow_trigger on public.follows;
create trigger tafa_notify_follow_trigger after insert on public.follows for each row execute function public.tafa_notify_follow();

create or replace function public.tafa_notify_page_follow()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select owner_id into owner_id from public.pages where id=new.page_id;
  perform public.tafa_notify(owner_id,new.user_id,'page_follow','Nouvel abonné','Un membre suit votre Page.','page',new.page_id,null);
  return new;
end; $$;
drop trigger if exists tafa_notify_page_follow_trigger on public.page_followers;
create trigger tafa_notify_page_follow_trigger after insert on public.page_followers for each row execute function public.tafa_notify_page_follow();

create or replace function public.tafa_notify_group_member()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select owner_id into owner_id from public.groups where id=new.group_id;
  perform public.tafa_notify(owner_id,new.user_id,'group_join','Nouveau membre','Un membre a rejoint votre groupe.','group',new.group_id,null);
  return new;
end; $$;
drop trigger if exists tafa_notify_group_member_trigger on public.group_members;
create trigger tafa_notify_group_member_trigger after insert on public.group_members for each row execute function public.tafa_notify_group_member();

-- =========================================================
-- REALTIME PUBLICATION
-- =========================================================

do $$
declare
  _tbl text;
begin
  foreach _tbl in array array[
    'blocked_profiles','profile_reports','payment_transactions','posts','post_reactions','comments',
    'post_shares','friend_requests','friendships','conversations','conversation_members','messages',
    'notifications','search_history','activity_history','user_settings','groups','group_members',
    'pages','page_followers','saved_posts'
  ] loop
    begin execute format('alter publication supabase_realtime add table public.%I', _tbl); exception when duplicate_object then null; end;
  end loop;
end $$;

alter table public.blocked_profiles replica identity full;
alter table public.profile_reports replica identity full;
alter table public.payment_transactions replica identity full;

select 'TAFAß V12 REAL SOCIAL READY' as status;

-- =========================================================
-- V12.1 — COMMENT LIKE ALERT + COMPLETE NOTIFICATION REALTIME
-- =========================================================
create or replace function public.tafa_notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare owner_id uuid;
declare post_id_value uuid;
begin
  select c.user_id, c.post_id into owner_id, post_id_value
    from public.comments c where c.id=new.comment_id;
  perform public.tafa_notify(owner_id,new.user_id,'comment_like','Réaction sur votre commentaire','Un membre a réagi à votre commentaire.','post',post_id_value,post_id_value);
  return new;
end;
$$;

drop trigger if exists tafa_notify_comment_like_trigger on public.comment_likes;
create trigger tafa_notify_comment_like_trigger
after insert on public.comment_likes
for each row execute function public.tafa_notify_comment_like();

-- Correct notification wording for shares.
create or replace function public.tafa_notify_share()
returns trigger language plpgsql security definer set search_path=public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id=new.post_id;
  perform public.tafa_notify(owner_id,new.user_id,'share','Nouveau partage','Un membre a partagé votre publication.','post',new.post_id,new.post_id);
  return new;
end; $$;

drop trigger if exists tafa_notify_share_trigger on public.post_shares;
create trigger tafa_notify_share_trigger after insert or update on public.post_shares for each row execute function public.tafa_notify_share();

do $$
begin
  begin execute 'alter publication supabase_realtime add table public.comment_likes'; exception when duplicate_object then null; end;
end $$;
alter table public.comment_likes replica identity full;

-- =========================================================
-- V12.2 — COMMON FRIENDS (REAL + RLS SAFE)
-- =========================================================
create or replace function public.tafa_common_friend_counts(p_user_ids uuid[])
returns table(user_id uuid, common_count bigint)
language sql
stable
security definer
set search_path=public
as $$
  select target.user_id, count(*)::bigint as common_count
  from public.friendships target
  join public.friendships mine
    on mine.friend_id = target.friend_id
   and mine.user_id = auth.uid()
  where target.user_id = any(p_user_ids)
    and target.user_id <> auth.uid()
  group by target.user_id;
$$;
grant execute on function public.tafa_common_friend_counts(uuid[]) to authenticated;
