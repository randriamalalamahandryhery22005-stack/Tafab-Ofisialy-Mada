-- Tafaß Live v1 — real-time live sessions + WebRTC signaling over Supabase Realtime
create table if not exists public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Direct Tafaß',
  status text not null default 'live' check (status in ('live','ended')),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists live_sessions_status_started_idx
  on public.live_sessions(status, started_at desc);
create index if not exists live_sessions_user_status_idx
  on public.live_sessions(user_id, status);

alter table public.live_sessions enable row level security;

drop policy if exists live_sessions_select on public.live_sessions;
create policy live_sessions_select
  on public.live_sessions for select to authenticated
  using (status='live' or user_id=auth.uid());

drop policy if exists live_sessions_insert on public.live_sessions;
create policy live_sessions_insert
  on public.live_sessions for insert to authenticated
  with check (user_id=auth.uid());

drop policy if exists live_sessions_update on public.live_sessions;
create policy live_sessions_update
  on public.live_sessions for update to authenticated
  using (user_id=auth.uid())
  with check (user_id=auth.uid());

grant select, insert, update on public.live_sessions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='live_sessions'
  ) then
    alter publication supabase_realtime add table public.live_sessions;
  end if;
end $$;

-- Optional structured metadata for real publication tools:
-- audience, music, tagged people, mood, event and live title can be kept here
-- without breaking older posts.
alter table public.posts
  add column if not exists publication_meta jsonb not null default '{}'::jsonb;

create index if not exists posts_publication_meta_gin_idx
  on public.posts using gin(publication_meta);

-- Make the publication audience selector real at database level.
drop policy if exists posts_select on public.posts;
create policy posts_select
  on public.posts for select to authenticated
  using (
    user_id = auth.uid()
    or visibility = 'public'
    or (
      visibility = 'friends'
      and exists (
        select 1 from public.friendships f
        where (f.user_id = auth.uid() and f.friend_id = posts.user_id)
           or (f.user_id = posts.user_id and f.friend_id = auth.uid())
      )
    )
  );
