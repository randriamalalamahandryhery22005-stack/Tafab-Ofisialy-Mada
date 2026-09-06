-- Tafaß V15 — Realtime + Data Integrity migration
-- Safe/repeatable. Run after the canonical schema and previous migrations.

-- 1) Persist message replies instead of keeping them only in the UI.
alter table if exists public.messages
  add column if not exists reply_to_id uuid;

do $$
begin
  if to_regclass('public.messages') is not null
     and not exists (
       select 1 from pg_constraint
       where conname = 'messages_reply_to_id_fkey'
         and conrelid = 'public.messages'::regclass
     ) then
    alter table public.messages
      add constraint messages_reply_to_id_fkey
      foreign key (reply_to_id) references public.messages(id) on delete set null;
  end if;
end $$;

create index if not exists idx_messages_reply_to_id
  on public.messages(reply_to_id)
  where reply_to_id is not null;

-- 2) Keep message edit timestamps usable even on databases created from older schema.
alter table if exists public.messages
  add column if not exists updated_at timestamptz;

-- 3) Realtime publication: add only tables that exist and are not already published.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','posts','comments','comment_likes','comment_reactions','post_reactions','post_shares',
    'notifications','messages','friend_requests','friendships','follows','groups','group_members',
    'group_posts','group_post_reactions','group_post_comments','group_post_shares','group_messages',
    'pages','page_members','page_followers','page_posts','page_post_reactions','page_post_comments',
    'page_post_shares','page_messages','conversations','conversation_members','saved_posts',
    'stories','story_views','reels','calls','call_participants','media_assets',
    'tafab_listings','tafab_listing_messages','tafab_ads'
  ] loop
    if to_regclass('public.'||t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname='supabase_realtime' and schemaname='public' and tablename=t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when undefined_object then
  -- Hosted projects normally provide supabase_realtime; do not fail the migration if it is absent.
  null;
end $$;

-- 4) Replica identity FULL makes UPDATE/DELETE payloads useful for realtime UI refreshes.
do $$
declare t text;
begin
  foreach t in array array['messages','group_messages','page_messages','group_posts','page_posts','notifications'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I replica identity full', t);
    end if;
  end loop;
end $$;
