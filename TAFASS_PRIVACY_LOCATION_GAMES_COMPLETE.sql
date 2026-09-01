/* TAFAß — Privacy protection + exact device location + game scores */
create extension if not exists pgcrypto;

create table if not exists public.privacy_protection_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  capture_protection boolean not null default true,
  private_media_longpress boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  altitude_m double precision,
  heading double precision,
  speed_mps double precision,
  place_name text,
  source text not null default 'device_gps',
  updated_at timestamptz not null default now()
);

create table if not exists public.game_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_id text not null,
  score bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(user_id,game_id)
);

alter table public.privacy_protection_settings enable row level security;
alter table public.profile_locations enable row level security;
alter table public.game_scores enable row level security;

drop policy if exists privacy_protection_select on public.privacy_protection_settings;
drop policy if exists privacy_protection_insert on public.privacy_protection_settings;
drop policy if exists privacy_protection_update on public.privacy_protection_settings;
create policy privacy_protection_select on public.privacy_protection_settings for select to authenticated using(user_id=auth.uid());
create policy privacy_protection_insert on public.privacy_protection_settings for insert to authenticated with check(user_id=auth.uid());
create policy privacy_protection_update on public.privacy_protection_settings for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists profile_locations_select on public.profile_locations;
drop policy if exists profile_locations_insert on public.profile_locations;
drop policy if exists profile_locations_update on public.profile_locations;
create policy profile_locations_select on public.profile_locations for select to authenticated using(user_id=auth.uid());
create policy profile_locations_insert on public.profile_locations for insert to authenticated with check(user_id=auth.uid());
create policy profile_locations_update on public.profile_locations for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists game_scores_select on public.game_scores;
drop policy if exists game_scores_insert on public.game_scores;
drop policy if exists game_scores_update on public.game_scores;
create policy game_scores_select on public.game_scores for select to authenticated using(user_id=auth.uid());
create policy game_scores_insert on public.game_scores for insert to authenticated with check(user_id=auth.uid());
create policy game_scores_update on public.game_scores for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

insert into public.privacy_protection_settings(user_id)
select id from public.profiles on conflict(user_id) do nothing;

insert into public.game_scores(user_id,game_id,score)
select id,'ludo',0 from public.profiles on conflict(user_id,game_id) do nothing;

insert into public.game_scores(user_id,game_id,score)
select id,'piano',0 from public.profiles on conflict(user_id,game_id) do nothing;

notify pgrst,'reload schema';
select 'TAFAß — PRIVACY + LOCATION + GAME SCORES SUCCESS' as status;
