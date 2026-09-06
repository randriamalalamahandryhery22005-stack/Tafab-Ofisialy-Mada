-- Tafaß V28.3 — Notifications 100% Realtime + Badge support
-- Safe/idempotent. No existing data is deleted.
-- Run AFTER the existing Tafaß schema/migrations.

create extension if not exists pgcrypto;

-- =========================================================
-- 1. Notifications: indexes + realtime payloads
-- =========================================================
alter table if exists public.notifications enable row level security;
alter table if exists public.notifications replica identity full;

create index if not exists notifications_user_unread_created_idx
  on public.notifications(user_id, is_read, created_at desc);
create index if not exists notifications_user_type_idx
  on public.notifications(user_id, type, created_at desc);
create index if not exists notifications_entity_idx
  on public.notifications(entity_type, entity_id, created_at desc);

-- Keep the existing security model: a member reads/updates only their notifications.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and (
      actor_id is null
      or to_regprocedure('public.tafa_is_blocked(uuid,uuid)') is null
      or not public.tafa_is_blocked(actor_id, auth.uid())
    )
  );

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (actor_id = auth.uid() or user_id = auth.uid());

grant select, insert, update on public.notifications to authenticated;

-- =========================================================
-- 2. Supabase Realtime publication
-- Add every notification-producing/notification-related table that
-- exists in this installation. Missing optional tables are skipped.
-- =========================================================
do $$
declare t text;
begin
  foreach t in array array[
    'notifications',
    'friend_requests','friendships','follows',
    'posts','post_reactions','post_shares','comments','comment_likes','comment_reactions',
    'messages','conversations','conversation_members',
    'pages','page_members','page_followers','page_posts','page_post_reactions','page_post_comments','page_post_shares','page_messages',
    'groups','group_members','group_posts','group_post_reactions','group_post_comments','group_post_shares','group_messages',
    'stories','story_views','reels',
    'tafab_listings','tafab_listing_messages','tafab_favorites','tafab_orders','tafab_order_items',
    'tafab_events','tafab_event_attendees','tafab_creator_drafts',
    'tafab_live_gifts','tafab_creator_subscriptions','tafab_withdrawal_requests',
    'tafab_music_tracks','tafab_music_likes','tafab_music_playlists','tafab_music_playlist_items','tafab_music_plays',
    'tafab_business_profiles','tafab_ad_campaigns','tafab_ad_events',
    'saved_posts','payment_transactions','activity_history'
  ] loop
    if to_regclass('public.'||t) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then null; when undefined_object then null; end;
    end if;
  end loop;
end $$;

-- FULL payloads make UPDATE/DELETE realtime events reliable for UI refreshes.
do $$
declare t text;
begin
  foreach t in array array[
    'notifications','friend_requests','friendships','follows',
    'posts','post_reactions','post_shares','comments','comment_likes','comment_reactions',
    'messages','conversations','conversation_members',
    'pages','page_members','page_followers','page_posts','page_post_reactions','page_post_comments','page_post_shares','page_messages',
    'groups','group_members','group_posts','group_post_reactions','group_post_comments','group_post_shares','group_messages',
    'stories','story_views','reels',
    'tafab_listings','tafab_listing_messages','tafab_favorites','tafab_orders','tafab_order_items',
    'tafab_events','tafab_event_attendees','tafab_creator_drafts',
    'tafab_live_gifts','tafab_creator_subscriptions','tafab_withdrawal_requests',
    'tafab_music_tracks','tafab_music_likes','tafab_music_playlists','tafab_music_playlist_items','tafab_music_plays',
    'tafab_business_profiles','tafab_ad_campaigns','tafab_ad_events',
    'saved_posts','payment_transactions','activity_history'
  ] loop
    if to_regclass('public.'||t) is not null then
      begin execute format('alter table public.%I replica identity full',t); exception when others then null; end;
    end if;
  end loop;
end $$;

-- =========================================================
-- 3. Central notification helper
-- SECURITY DEFINER is used only for the server-side trigger helpers.
-- The actor is always taken from auth.uid(); clients cannot impersonate it.
-- =========================================================
create or replace function public.tafab_create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text default '',
  p_entity_type text default '',
  p_entity_id uuid default null,
  p_post_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_user_id is null or p_user_id = auth.uid() then return null; end if;
  if not exists (select 1 from public.profiles where id=p_user_id) then return null; end if;
  if to_regprocedure('public.tafa_is_blocked(uuid,uuid)') is not null
     and auth.uid() is not null
     and public.tafa_is_blocked(auth.uid(), p_user_id) then
    return null;
  end if;

  insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,post_id,is_read)
  values(p_user_id,auth.uid(),coalesce(p_type,'general'),coalesce(p_title,''),coalesce(p_message,''),coalesce(p_entity_type,''),p_entity_id,p_post_id,false)
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.tafab_create_notification(uuid,text,text,text,text,uuid,uuid) to authenticated;

-- =========================================================
-- 4. Automatic realtime notifications for core social actions
-- These are additive and deliberately skip self-notifications.
-- =========================================================
create or replace function public.tafab_notify_friend_request()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' and new.sender_id<>new.receiver_id then
    insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,is_read)
    values(new.receiver_id,new.sender_id,'friend_request','Nouvelle demande d’amitié','Vous avez reçu une nouvelle demande d’amitié.','friend_request',new.id,false);
  end if;
  return new;
end $$;

drop trigger if exists tafab_notify_friend_request on public.friend_requests;
create trigger tafab_notify_friend_request after insert on public.friend_requests
for each row execute function public.tafab_notify_friend_request();

create or replace function public.tafab_notify_follow()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.follower_id<>new.following_id then
    insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,is_read)
    values(new.following_id,new.follower_id,'follow','Nouvel abonné','Un membre vous suit maintenant.','follow',new.id,false);
  end if;
  return new;
end $$;

drop trigger if exists tafab_notify_follow on public.follows;
create trigger tafab_notify_follow after insert on public.follows
for each row execute function public.tafab_notify_follow();

create or replace function public.tafab_notify_post_reaction()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.posts where id=new.post_id;
  if v_owner is not null and v_owner<>new.user_id then
    insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,post_id,is_read)
    values(v_owner,new.user_id,'reaction','Nouvelle réaction','Quelqu’un a réagi à votre publication.','post',new.post_id,new.post_id,false);
  end if;
  return new;
end $$;

drop trigger if exists tafab_notify_post_reaction on public.post_reactions;
create trigger tafab_notify_post_reaction after insert on public.post_reactions
for each row execute function public.tafab_notify_post_reaction();

create or replace function public.tafab_notify_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.posts where id=new.post_id;
  if v_owner is not null and v_owner<>new.user_id then
    insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,post_id,is_read)
    values(v_owner,new.user_id,'comment','Nouveau commentaire','Quelqu’un a commenté votre publication.','post',new.post_id,new.post_id,false);
  end if;
  return new;
end $$;

drop trigger if exists tafab_notify_comment on public.comments;
create trigger tafab_notify_comment after insert on public.comments
for each row execute function public.tafab_notify_comment();

-- =========================================================
-- 5. Notify the other side when a Marketplace order is created.
-- =========================================================
create or replace function public.tafab_notify_order()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.seller_id is not null and new.seller_id<>new.buyer_id then
    insert into public.notifications(user_id,actor_id,type,title,message,entity_type,entity_id,is_read)
    values(new.seller_id,new.buyer_id,'marketplace_order','Nouvelle commande','Vous avez reçu une nouvelle commande sur Tafaß.','order',new.id,false);
  end if;
  return new;
end $$;

do $$
begin
  if to_regclass('public.tafab_orders') is not null then
    drop trigger if exists tafab_notify_order on public.tafab_orders;
    create trigger tafab_notify_order after insert on public.tafab_orders
    for each row execute function public.tafab_notify_order();
  end if;
end $$;

notify pgrst,'reload schema';
select 'TAFAß V28.3 — NOTIFICATIONS + REALTIME COMPLETE' as status;
