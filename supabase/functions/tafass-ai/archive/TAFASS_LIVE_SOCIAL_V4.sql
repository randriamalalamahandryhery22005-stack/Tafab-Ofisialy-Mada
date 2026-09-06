-- Tafaß V4 — live comments + safe live lifecycle + publication metadata helpers

create table if not exists public.live_comments (
  id uuid primary key default gen_random_uuid(),
  live_session_id uuid not null references public.live_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists live_comments_session_created_idx
  on public.live_comments(live_session_id, created_at);

alter table public.live_comments enable row level security;

drop policy if exists live_comments_select on public.live_comments;
create policy live_comments_select
  on public.live_comments for select to authenticated
  using (exists (select 1 from public.live_sessions l where l.id=live_session_id and l.status='live')
         or user_id=auth.uid());

drop policy if exists live_comments_insert on public.live_comments;
create policy live_comments_insert
  on public.live_comments for insert to authenticated
  with check (user_id=auth.uid() and exists (select 1 from public.live_sessions l where l.id=live_session_id and l.status='live'));

grant select, insert on public.live_comments to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='live_comments'
  ) then
    alter publication supabase_realtime add table public.live_comments;
  end if;
end $$;

-- Keep at most one active live session per account.
create unique index if not exists live_sessions_one_active_per_user_idx
  on public.live_sessions(user_id) where status='live';

-- Publication metadata is intentionally JSONB so old posts remain compatible.
alter table public.posts add column if not exists publication_meta jsonb not null default '{}'::jsonb;
create index if not exists posts_publication_meta_gin_idx_v4 on public.posts using gin(publication_meta);
