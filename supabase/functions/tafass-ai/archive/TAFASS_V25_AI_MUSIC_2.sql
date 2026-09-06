-- Tafaß V25 — AI Workspace + Music 2.0
-- Additive only: no existing table/data is deleted or altered.
create extension if not exists pgcrypto;

create table if not exists public.tafab_ai_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'assistant',
  prompt text not null check (char_length(prompt) between 1 and 8000),
  response text not null check (char_length(response) between 1 and 20000),
  created_at timestamptz not null default now()
);
create index if not exists tafab_ai_history_user_created_idx on public.tafab_ai_history(user_id, created_at desc);
alter table public.tafab_ai_history enable row level security;
drop policy if exists tafab_ai_history_select_own on public.tafab_ai_history;
create policy tafab_ai_history_select_own on public.tafab_ai_history for select using (auth.uid()=user_id);
drop policy if exists tafab_ai_history_insert_own on public.tafab_ai_history;
create policy tafab_ai_history_insert_own on public.tafab_ai_history for insert with check (auth.uid()=user_id);
drop policy if exists tafab_ai_history_delete_own on public.tafab_ai_history;
create policy tafab_ai_history_delete_own on public.tafab_ai_history for delete using (auth.uid()=user_id);

create table if not exists public.tafab_music_artists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  username text,
  bio text,
  avatar_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.tafab_music_tracks (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.tafab_music_artists(id) on delete set null,
  title text not null,
  genre text,
  mood text,
  duration_seconds integer not null default 0 check(duration_seconds>=0),
  audio_url text,
  cover_url text,
  is_published boolean not null default true,
  play_count bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.tafab_music_albums (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.tafab_music_artists(id) on delete set null,
  title text not null,
  cover_url text,
  release_date date,
  created_at timestamptz not null default now()
);
create table if not exists public.tafab_music_album_items (
  album_id uuid not null references public.tafab_music_albums(id) on delete cascade,
  track_id uuid not null references public.tafab_music_tracks(id) on delete cascade,
  position integer not null default 0,
  primary key(album_id, track_id)
);
create table if not exists public.tafab_music_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  cover_url text,
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.tafab_music_playlist_items (
  playlist_id uuid not null references public.tafab_music_playlists(id) on delete cascade,
  track_id uuid not null references public.tafab_music_tracks(id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key(playlist_id, track_id)
);
create table if not exists public.tafab_music_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tafab_music_tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, track_id)
);
create table if not exists public.tafab_music_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  artist_id uuid not null references public.tafab_music_artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, artist_id)
);
create table if not exists public.tafab_music_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  track_id uuid not null references public.tafab_music_tracks(id) on delete cascade,
  played_at timestamptz not null default now()
);

create index if not exists tafab_music_tracks_search_idx on public.tafab_music_tracks using gin(to_tsvector('simple', coalesce(title,'')||' '||coalesce(genre,'')||' '||coalesce(mood,'')));

alter table public.tafab_music_artists enable row level security;
alter table public.tafab_music_tracks enable row level security;
alter table public.tafab_music_albums enable row level security;
alter table public.tafab_music_album_items enable row level security;
alter table public.tafab_music_playlists enable row level security;
alter table public.tafab_music_playlist_items enable row level security;
alter table public.tafab_music_likes enable row level security;
alter table public.tafab_music_follows enable row level security;
alter table public.tafab_music_plays enable row level security;

-- Public catalog; writes are restricted to owners through owner_id / future server-side workflows.
drop policy if exists tafab_music_artists_public_select on public.tafab_music_artists;
create policy tafab_music_artists_public_select on public.tafab_music_artists for select using (true);
drop policy if exists tafab_music_tracks_public_select on public.tafab_music_tracks;
create policy tafab_music_tracks_public_select on public.tafab_music_tracks for select using (is_published=true or exists(select 1 from public.tafab_music_artists a where a.id=artist_id and a.owner_id=auth.uid()));
drop policy if exists tafab_music_albums_public_select on public.tafab_music_albums;
create policy tafab_music_albums_public_select on public.tafab_music_albums for select using (true);
drop policy if exists tafab_music_album_items_public_select on public.tafab_music_album_items;
create policy tafab_music_album_items_public_select on public.tafab_music_album_items for select using (true);
drop policy if exists tafab_music_playlists_select on public.tafab_music_playlists;
create policy tafab_music_playlists_select on public.tafab_music_playlists for select using (is_public=true or user_id=auth.uid());
drop policy if exists tafab_music_playlists_insert on public.tafab_music_playlists;
create policy tafab_music_playlists_insert on public.tafab_music_playlists for insert with check (user_id=auth.uid());
drop policy if exists tafab_music_playlists_update on public.tafab_music_playlists;
create policy tafab_music_playlists_update on public.tafab_music_playlists for update using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists tafab_music_playlists_delete on public.tafab_music_playlists;
create policy tafab_music_playlists_delete on public.tafab_music_playlists for delete using (user_id=auth.uid());
drop policy if exists tafab_music_playlist_items_own on public.tafab_music_playlist_items;
create policy tafab_music_playlist_items_own on public.tafab_music_playlist_items for all using (exists(select 1 from public.tafab_music_playlists p where p.id=playlist_id and p.user_id=auth.uid())) with check (exists(select 1 from public.tafab_music_playlists p where p.id=playlist_id and p.user_id=auth.uid()));
drop policy if exists tafab_music_likes_own on public.tafab_music_likes;
create policy tafab_music_likes_own on public.tafab_music_likes for all using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists tafab_music_follows_own on public.tafab_music_follows;
create policy tafab_music_follows_own on public.tafab_music_follows for all using (user_id=auth.uid()) with check (user_id=auth.uid());
drop policy if exists tafab_music_plays_insert on public.tafab_music_plays;
create policy tafab_music_plays_insert on public.tafab_music_plays for insert with check (user_id=auth.uid() or user_id is null);
drop policy if exists tafab_music_plays_select_own on public.tafab_music_plays;
create policy tafab_music_plays_select_own on public.tafab_music_plays for select using (user_id=auth.uid());

-- Atomic play counter. Client can only call this RPC; no direct track counter updates are granted.
create or replace function public.tafab_music_register_play(p_track_id uuid)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_count bigint;
begin
  if not exists(select 1 from public.tafab_music_tracks where id=p_track_id and is_published=true) then raise exception 'Track unavailable'; end if;
  insert into public.tafab_music_plays(user_id,track_id) values(auth.uid(),p_track_id);
  update public.tafab_music_tracks set play_count=play_count+1 where id=p_track_id returning play_count into v_count;
  return v_count;
end $$;
revoke all on function public.tafab_music_register_play(uuid) from public;
grant execute on function public.tafab_music_register_play(uuid) to authenticated;

alter table public.tafab_music_artists replica identity full;
alter table public.tafab_music_tracks replica identity full;
alter table public.tafab_music_playlists replica identity full;
DO $$ BEGIN
  alter publication supabase_realtime add table public.tafab_music_artists;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  alter publication supabase_realtime add table public.tafab_music_tracks;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  alter publication supabase_realtime add table public.tafab_music_playlists;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  alter publication supabase_realtime add table public.tafab_music_likes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
