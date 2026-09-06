-- Tafaß V23 — Events + Creator Studio
create extension if not exists pgcrypto;

create table if not exists public.tafab_events (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  visibility text not null default 'public' check (visibility in ('public','private')),
  status text not null default 'published' check (status in ('draft','published','cancelled','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tafab_events_start_idx on public.tafab_events(starts_at);
create index if not exists tafab_events_creator_idx on public.tafab_events(creator_id,created_at desc);

create table if not exists public.tafab_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.tafab_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,user_id)
);
create index if not exists tafab_event_attendees_event_idx on public.tafab_event_attendees(event_id,status);
create index if not exists tafab_event_attendees_user_idx on public.tafab_event_attendees(user_id,status);

create table if not exists public.tafab_creator_drafts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Sans titre',
  body text not null default '',
  content_type text not null default 'post' check (content_type in ('post','video','reel','story')),
  media_url text,
  media_type text,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tafab_creator_drafts_creator_idx on public.tafab_creator_drafts(creator_id,updated_at desc);

alter table public.tafab_events enable row level security;
alter table public.tafab_event_attendees enable row level security;
alter table public.tafab_creator_drafts enable row level security;

drop policy if exists "events_select_public" on public.tafab_events;
create policy "events_select_public" on public.tafab_events for select to authenticated using (visibility='public' or creator_id=auth.uid());
drop policy if exists "events_insert_own" on public.tafab_events;
create policy "events_insert_own" on public.tafab_events for insert to authenticated with check (creator_id=auth.uid());
drop policy if exists "events_update_own" on public.tafab_events;
create policy "events_update_own" on public.tafab_events for update to authenticated using (creator_id=auth.uid()) with check (creator_id=auth.uid());
drop policy if exists "events_delete_own" on public.tafab_events;
create policy "events_delete_own" on public.tafab_events for delete to authenticated using (creator_id=auth.uid());

drop policy if exists "event_attendees_select" on public.tafab_event_attendees;
create policy "event_attendees_select" on public.tafab_event_attendees for select to authenticated using (exists (select 1 from public.tafab_events e where e.id=event_id and (e.visibility='public' or e.creator_id=auth.uid())) or user_id=auth.uid());
drop policy if exists "event_attendees_insert_own" on public.tafab_event_attendees;
create policy "event_attendees_insert_own" on public.tafab_event_attendees for insert to authenticated with check (user_id=auth.uid());
drop policy if exists "event_attendees_update_own" on public.tafab_event_attendees;
create policy "event_attendees_update_own" on public.tafab_event_attendees for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists "event_attendees_delete_own" on public.tafab_event_attendees;
create policy "event_attendees_delete_own" on public.tafab_event_attendees for delete to authenticated using (user_id=auth.uid());

drop policy if exists "creator_drafts_own" on public.tafab_creator_drafts;
create policy "creator_drafts_own" on public.tafab_creator_drafts for all to authenticated using (creator_id=auth.uid()) with check (creator_id=auth.uid());

alter table public.tafab_events replica identity full;
alter table public.tafab_event_attendees replica identity full;
alter table public.tafab_creator_drafts replica identity full;

-- Add the tables to Supabase Realtime if not already present.
do $$ begin
  alter publication supabase_realtime add table public.tafab_events;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tafab_event_attendees;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.tafab_creator_drafts;
exception when duplicate_object then null; when undefined_object then null; end $$;

notify pgrst, 'reload schema';
