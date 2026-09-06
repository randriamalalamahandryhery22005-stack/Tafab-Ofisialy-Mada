/* TAFAß — Réglages UI inspirés de l’interface de référence.
   À exécuter APRÈS TAFASS_COMPLETE_SCHEMA.sql et TAFASS_SETTINGS_COMPLETE_REALTIME.sql.
   Idempotent. */

create table if not exists public.story_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_public_sharing boolean not null default true,
  allow_personal_sharing boolean not null default true,
  allow_mention_sharing boolean not null default true,
  allow_story_sharing boolean not null default true,
  archive_stories boolean not null default true,
  muted_stories_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.publication_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  future_audience text not null default 'public' check(future_audience in ('public','friends','private')),
  limit_old_posts boolean not null default false,
  comment_summaries boolean not null default true,
  share_posts_to_story boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_content_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  followers_visibility text not null default 'public' check(followers_visibility in ('public','friends','private')),
  following_visibility text not null default 'private' check(following_visibility in ('public','friends','private')),
  public_comments text not null default 'public' check(public_comments in ('public','followers','friends','private')),
  public_post_notifications boolean not null default true,
  public_profile_info boolean not null default true,
  relevant_comments_first boolean not null default true,
  off_facebook_preview boolean not null default true,
  blocklist_filter boolean not null default false,
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['story_settings','publication_settings','public_content_settings'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I_select on public.%I',replace(t,'_settings',''),t);
    execute format('drop policy if exists %I_insert on public.%I',replace(t,'_settings',''),t);
    execute format('drop policy if exists %I_update on public.%I',replace(t,'_settings',''),t);
    execute format('create policy %I_select on public.%I for select to authenticated using(user_id=auth.uid())',replace(t,'_settings',''),t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check(user_id=auth.uid())',replace(t,'_settings',''),t);
    execute format('create policy %I_update on public.%I for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid())',replace(t,'_settings',''),t);
    execute format('alter table public.%I replica identity full',t);
    begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
  end loop;
end $$;

insert into public.story_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.publication_settings(user_id) select id from public.profiles on conflict do nothing;
insert into public.public_content_settings(user_id) select id from public.profiles on conflict do nothing;
