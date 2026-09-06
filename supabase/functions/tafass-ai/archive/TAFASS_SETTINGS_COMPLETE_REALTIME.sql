/* =========================================================
   TAFAß — PARAMÈTRES COMPLETS / TABLES + RLS + REALTIME
   Exécuter après le schéma principal Tafaß.
   Idempotent: peut être relancé.
   ========================================================= */
create extension if not exists pgcrypto;

/* ---------- tables: un enregistrement par utilisateur ---------- */
create table if not exists public.audience_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  default_post_audience text not null default 'public' check(default_post_audience in ('public','friends','private')),
  story_audience text not null default 'public' check(story_audience in ('public','friends','private')),
  reel_audience text not null default 'public' check(reel_audience in ('public','friends','private')),
  followers_visibility text not null default 'public' check(followers_visibility in ('public','friends','private')),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  safety_mode boolean not null default true,
  contact_restrictions boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.reaction_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  show_reaction_counts boolean not null default true,
  personalized_reactions boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.accessibility_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  large_text boolean not null default false,
  reduce_motion boolean not null default false,
  high_contrast boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.media_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  autoplay_videos boolean not null default true,
  data_saver boolean not null default false,
  upload_quality text not null default 'standard' check(upload_quality in ('standard','high','data_saver')),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_management_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_limit_minutes integer not null default 0 check(daily_limit_minutes between 0 and 1440),
  reminders_enabled boolean not null default true,
  quiet_start time not null default '22:00',
  quiet_end time not null default '06:00',
  updated_at timestamptz not null default now()
);

create table if not exists public.effects_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  effects_enabled boolean not null default true,
  face_effects boolean not null default true,
  hand_effects boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_identification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_tagging boolean not null default true,
  review_tags boolean not null default false,
  search_engine_index boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.online_status_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visible boolean not null default true,
  last_seen_visible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.location_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  profile_location_enabled boolean not null default true,
  precise_location_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.professional_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

/* ---------- connexions / sécurité ---------- */
create table if not exists public.connected_apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  app_name text not null,
  provider text,
  status text not null default 'active' check(status in ('active','revoked')),
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists connected_apps_user_idx on public.connected_apps(user_id,connected_at desc);

create table if not exists public.professional_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null,
  status text not null default 'active' check(status in ('active','revoked')),
  connected_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists professional_integrations_user_idx on public.professional_integrations(user_id,connected_at desc);

create table if not exists public.security_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_session_id text not null,
  device_label text not null default 'Tafaß',
  active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(user_id,device_session_id)
);
create index if not exists security_sessions_user_idx on public.security_sessions(user_id,last_seen_at desc);

create table if not exists public.login_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_session_id text,
  event_type text not null,
  device_label text,
  created_at timestamptz not null default now()
);
create index if not exists login_activity_user_idx on public.login_activity(user_id,created_at desc);

/* ---------- données / obligations légales ---------- */
create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check(request_type in ('export','deletion')),
  status text not null default 'pending' check(status in ('pending','processing','completed','rejected','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists data_requests_user_idx on public.data_requests(user_id,created_at desc);

create table if not exists public.legal_acceptances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_type text not null check(document_type in ('terms','privacy-policy','cookies','community-standards')),
  document_version text not null default '1.0',
  accepted_at timestamptz not null default now(),
  primary key(user_id,document_type)
);

/* ---------- préférences publicitaires, utilisées par Espace Compte ---------- */
create table if not exists public.ad_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  personalized_ads boolean not null default true,
  activity_based_ads boolean not null default true,
  partner_data_ads boolean not null default false,
  updated_at timestamptz not null default now()
);

/* ---------- RLS ---------- */
do $$ declare t text; begin
  foreach t in array array[
    'audience_settings','family_settings','reaction_settings','accessibility_settings','media_settings',
    'time_management_settings','effects_settings','profile_identification_settings','online_status_settings',
    'location_settings','professional_settings','connected_apps','professional_integrations','security_sessions',
    'login_activity','data_requests','legal_acceptances','ad_preferences'
  ] loop execute format('alter table public.%I enable row level security',t); end loop;
end $$;

/* helper: policies are replaced so rerunning the script is safe */
drop policy if exists audience_select on public.audience_settings;
drop policy if exists audience_insert on public.audience_settings;
drop policy if exists audience_update on public.audience_settings;
create policy audience_select on public.audience_settings for select to authenticated using(user_id=auth.uid());
create policy audience_insert on public.audience_settings for insert to authenticated with check(user_id=auth.uid());
create policy audience_update on public.audience_settings for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

do $$ declare t text; begin
  foreach t in array array['family_settings','reaction_settings','accessibility_settings','media_settings','time_management_settings','effects_settings','profile_identification_settings','online_status_settings','location_settings','professional_settings','ad_preferences'] loop
    execute format('drop policy if exists %I_select on public.%I',replace(t,'_settings',''),t);
    execute format('drop policy if exists %I_insert on public.%I',replace(t,'_settings',''),t);
    execute format('drop policy if exists %I_update on public.%I',replace(t,'_settings',''),t);
    execute format('create policy %I_select on public.%I for select to authenticated using(user_id=auth.uid())',replace(t,'_settings',''),t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check(user_id=auth.uid())',replace(t,'_settings',''),t);
    execute format('create policy %I_update on public.%I for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',replace(t,'_settings',''),t);
  end loop;
end $$;

/* connected apps / integrations */
drop policy if exists connected_apps_select on public.connected_apps;
drop policy if exists connected_apps_insert on public.connected_apps;
drop policy if exists connected_apps_update on public.connected_apps;
create policy connected_apps_select on public.connected_apps for select to authenticated using(user_id=auth.uid());
create policy connected_apps_insert on public.connected_apps for insert to authenticated with check(user_id=auth.uid());
create policy connected_apps_update on public.connected_apps for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists professional_integrations_select on public.professional_integrations;
drop policy if exists professional_integrations_insert on public.professional_integrations;
drop policy if exists professional_integrations_update on public.professional_integrations;
create policy professional_integrations_select on public.professional_integrations for select to authenticated using(user_id=auth.uid());
create policy professional_integrations_insert on public.professional_integrations for insert to authenticated with check(user_id=auth.uid());
create policy professional_integrations_update on public.professional_integrations for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

/* security sessions */
drop policy if exists security_sessions_select on public.security_sessions;
drop policy if exists security_sessions_insert on public.security_sessions;
drop policy if exists security_sessions_update on public.security_sessions;
create policy security_sessions_select on public.security_sessions for select to authenticated using(user_id=auth.uid());
create policy security_sessions_insert on public.security_sessions for insert to authenticated with check(user_id=auth.uid());
create policy security_sessions_update on public.security_sessions for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

/* login activity */
drop policy if exists login_activity_select on public.login_activity;
drop policy if exists login_activity_insert on public.login_activity;
create policy login_activity_select on public.login_activity for select to authenticated using(user_id=auth.uid());
create policy login_activity_insert on public.login_activity for insert to authenticated with check(user_id=auth.uid());

/* data requests: user can create and view, but processing is reserved for server/admin */
drop policy if exists data_requests_select on public.data_requests;
drop policy if exists data_requests_insert on public.data_requests;
create policy data_requests_select on public.data_requests for select to authenticated using(user_id=auth.uid());
create policy data_requests_insert on public.data_requests for insert to authenticated with check(user_id=auth.uid());

/* legal */
drop policy if exists legal_acceptances_select on public.legal_acceptances;
drop policy if exists legal_acceptances_insert on public.legal_acceptances;
drop policy if exists legal_acceptances_update on public.legal_acceptances;
create policy legal_acceptances_select on public.legal_acceptances for select to authenticated using(user_id=auth.uid());
create policy legal_acceptances_insert on public.legal_acceptances for insert to authenticated with check(user_id=auth.uid());
create policy legal_acceptances_update on public.legal_acceptances for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

/* ---------- realtime ---------- */
do $$
declare t text;
begin
  foreach t in array array[
    'audience_settings','family_settings','reaction_settings','accessibility_settings','media_settings',
    'time_management_settings','effects_settings','profile_identification_settings','online_status_settings',
    'location_settings','professional_settings','connected_apps','professional_integrations','security_sessions',
    'login_activity','data_requests','legal_acceptances','ad_preferences'
  ] loop
    execute format('alter table public.%I replica identity full',t);
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;

/* ---------- auto-create defaults for new profiles ---------- */
create or replace function public.tafa_create_default_settings()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.user_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.audience_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.family_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.reaction_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.accessibility_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.media_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.time_management_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.effects_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.profile_identification_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.online_status_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.location_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.professional_settings(user_id) values(new.id) on conflict do nothing;
  insert into public.ad_preferences(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists tafa_default_settings_after_profile on public.profiles;
create trigger tafa_default_settings_after_profile
after insert on public.profiles
for each row execute function public.tafa_create_default_settings();

notify pgrst, 'reload schema';
select 'TAFAß SETTINGS COMPLETE — TABLES + RLS + REALTIME READY' as status;

/* ---------- appliquer réellement les audiences aux publications/stories ---------- */
create or replace function public.tafa_can_view_social_post(p_owner uuid, p_visibility text)
returns boolean language sql stable security definer set search_path=public as $$
  select
    auth.uid() = p_owner
    or p_visibility = 'public'
    or (
      p_visibility = 'friends'
      and exists (
        select 1 from public.friendships f
        where ((f.user_id=auth.uid() and f.friend_id=p_owner)
            or (f.user_id=p_owner and f.friend_id=auth.uid()))
      )
    );
$$;
grant execute on function public.tafa_can_view_social_post(uuid,text) to authenticated;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select to authenticated
using(public.tafa_can_view_social_post(user_id,visibility));

drop policy if exists stories_select on public.stories;
create policy stories_select on public.stories for select to authenticated
using(public.tafa_can_view_social_post(user_id,visibility) and expires_at > now());

/* Seed missing settings for profiles that already exist. */
insert into public.audience_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.family_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.reaction_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.accessibility_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.media_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.time_management_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.effects_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.profile_identification_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.online_status_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.location_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.professional_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.ad_preferences(user_id) select id from public.profiles on conflict do nothing;

notify pgrst, 'reload schema';
select 'TAFAß SETTINGS COMPLETE + REAL AUDIENCE POLICIES + REALTIME READY' as status;
