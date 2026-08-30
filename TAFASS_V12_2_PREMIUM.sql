/*
  TAFAß V12.2 PREMIUM — REAL ONLY
  No demo, fake, mock or seed data is inserted.
  Run after TAFASS_NEW_PROJECT.sql, V10, V11 and V12 REAL SOCIAL.
*/

create index if not exists idx_notifications_user_created
  on public.notifications(user_id, created_at desc);
create index if not exists idx_messages_conversation_created
  on public.messages(conversation_id, created_at desc);
create index if not exists idx_friendships_user_friend
  on public.friendships(user_id, friend_id);
create index if not exists idx_friend_requests_receiver_status
  on public.friend_requests(receiver_id, status);
create index if not exists idx_pages_created
  on public.pages(created_at desc);
create index if not exists idx_groups_created
  on public.groups(created_at desc);
create index if not exists idx_page_followers_page
  on public.page_followers(page_id);
create index if not exists idx_group_members_group
  on public.group_members(group_id);

/* Keep updated_at correct for editable Pages and Groups. */
create or replace function public.tafa_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tafa_pages_touch_updated_at on public.pages;
create trigger tafa_pages_touch_updated_at
before update on public.pages
for each row execute function public.tafa_touch_updated_at();

drop trigger if exists tafa_groups_touch_updated_at on public.groups;
create trigger tafa_groups_touch_updated_at
before update on public.groups
for each row execute function public.tafa_touch_updated_at();

/* Realtime publication for every table used by the premium UI. */
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','posts','post_reactions','comments','comment_likes','post_shares',
    'friend_requests','friendships','follows','conversations','conversation_members',
    'messages','notifications','groups','group_members','pages','page_followers',
    'saved_posts','search_history','user_settings','activity_history',
    'blocked_profiles','profile_reports','payment_transactions'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

alter table public.notifications replica identity full;
alter table public.messages replica identity full;
alter table public.friend_requests replica identity full;
alter table public.friendships replica identity full;
alter table public.groups replica identity full;
alter table public.group_members replica identity full;
alter table public.pages replica identity full;
alter table public.page_followers replica identity full;
alter table public.user_settings replica identity full;

select 'TAFAß V12.2 PREMIUM REAL READY' as status;
