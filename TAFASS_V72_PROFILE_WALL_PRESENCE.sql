-- ============================================================
-- Tafaß V72 — Profile wall + realtime presence
-- ============================================================

begin;

-- Last-seen is server maintained by a SECURITY DEFINER function.
alter table public.profiles
  add column if not exists last_seen_at timestamptz;

create table if not exists public.tafa_profile_wall_settings (
  profile_owner_id uuid primary key references public.profiles(id) on delete cascade,
  allow_friend_posts boolean not null default true,
  require_approval boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.tafa_profile_wall_posts (
  id uuid primary key default gen_random_uuid(),
  profile_owner_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  media_url text,
  media_type text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','deleted')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_tafa_profile_wall_owner_created
  on public.tafa_profile_wall_posts(profile_owner_id, created_at desc);
create index if not exists idx_tafa_profile_wall_author
  on public.tafa_profile_wall_posts(author_id, created_at desc);

alter table public.tafa_profile_wall_settings enable row level security;
alter table public.tafa_profile_wall_posts enable row level security;

-- Settings: only the profile owner can read/change them.
drop policy if exists "tafa wall settings owner read" on public.tafa_profile_wall_settings;
create policy "tafa wall settings owner read"
  on public.tafa_profile_wall_settings for select
  to authenticated
  using (profile_owner_id = auth.uid());

drop policy if exists "tafa wall settings owner write" on public.tafa_profile_wall_settings;
create policy "tafa wall settings owner write"
  on public.tafa_profile_wall_settings for all
  to authenticated
  using (profile_owner_id = auth.uid())
  with check (profile_owner_id = auth.uid());

-- Approved posts are public to authenticated Tafaß users; pending posts are
-- visible only to the owner/author so an owner can review them.
drop policy if exists "tafa wall posts read" on public.tafa_profile_wall_posts;
create policy "tafa wall posts read"
  on public.tafa_profile_wall_posts for select
  to authenticated
  using (status = 'approved' or profile_owner_id = auth.uid() or author_id = auth.uid());

drop policy if exists "tafa wall posts owner author delete" on public.tafa_profile_wall_posts;
create policy "tafa wall posts owner author delete"
  on public.tafa_profile_wall_posts for delete
  to authenticated
  using (profile_owner_id = auth.uid() or author_id = auth.uid());

-- Server-side presence heartbeat. It never accepts a user id from the client.
create or replace function public.tafa_touch_presence()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
     set last_seen_at = now()
   where id = auth.uid();
end;
$$;
revoke all on function public.tafa_touch_presence() from public;
grant execute on function public.tafa_touch_presence() to authenticated;

create or replace function public.tafa_create_profile_wall_post(
  p_profile_owner_id uuid,
  p_content text default '',
  p_media_url text default null,
  p_media_type text default null
)
returns public.tafa_profile_wall_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.tafa_profile_wall_settings;
  row public.tafa_profile_wall_posts;
  is_friend boolean := false;
  final_status text := 'pending';
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if p_profile_owner_id is null then raise exception 'Profil cible invalide'; end if;
  if not exists(select 1 from public.profiles where id=p_profile_owner_id) then raise exception 'Profil introuvable'; end if;
  if coalesce(length(trim(p_content)),0)=0 and coalesce(p_media_url,'')='' then raise exception 'Publication vide'; end if;

  select * into cfg
  from public.tafa_profile_wall_settings
  where profile_owner_id=p_profile_owner_id;
  if not found then
    insert into public.tafa_profile_wall_settings(profile_owner_id)
    values(p_profile_owner_id)
    on conflict(profile_owner_id) do nothing;
    select * into cfg from public.tafa_profile_wall_settings where profile_owner_id=p_profile_owner_id;
  end if;

  if p_profile_owner_id <> auth.uid() then
    select exists(
      select 1 from public.friendships f
      where (f.user_id=auth.uid() and f.friend_id=p_profile_owner_id)
         or (f.user_id=p_profile_owner_id and f.friend_id=auth.uid())
    ) into is_friend;
    if not is_friend then raise exception 'Seuls vos amis peuvent publier sur ce profil'; end if;
    if not cfg.allow_friend_posts then raise exception 'Le propriétaire n’autorise pas les publications des amis'; end if;
    if not cfg.require_approval then final_status := 'approved'; end if;
  else
    final_status := 'approved';
  end if;

  insert into public.tafa_profile_wall_posts(profile_owner_id,author_id,content,media_url,media_type,status,approved_at,approved_by)
  values(p_profile_owner_id,auth.uid(),coalesce(trim(p_content),''),p_media_url,p_media_type,final_status,
         case when final_status='approved' then now() end,
         case when final_status='approved' then auth.uid() end)
  returning * into row;
  return row;
end;
$$;
revoke all on function public.tafa_create_profile_wall_post(uuid,text,text,text) from public;
grant execute on function public.tafa_create_profile_wall_post(uuid,text,text,text) to authenticated;

create or replace function public.tafa_set_profile_wall_settings(
  p_allow_friend_posts boolean,
  p_require_approval boolean
)
returns public.tafa_profile_wall_settings
language plpgsql
security definer
set search_path = public
as $$
declare row public.tafa_profile_wall_settings;
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  insert into public.tafa_profile_wall_settings(profile_owner_id,allow_friend_posts,require_approval,updated_at)
  values(auth.uid(),coalesce(p_allow_friend_posts,true),coalesce(p_require_approval,true),now())
  on conflict(profile_owner_id) do update set
    allow_friend_posts=excluded.allow_friend_posts,
    require_approval=excluded.require_approval,
    updated_at=now()
  returning * into row;
  return row;
end;
$$;
revoke all on function public.tafa_set_profile_wall_settings(boolean,boolean) from public;
grant execute on function public.tafa_set_profile_wall_settings(boolean,boolean) to authenticated;

create or replace function public.tafa_moderate_profile_wall_post(
  p_post_id uuid,
  p_status text
)
returns public.tafa_profile_wall_posts
language plpgsql
security definer
set search_path = public
as $$
declare row public.tafa_profile_wall_posts;
begin
  if p_status not in ('approved','rejected','deleted') then raise exception 'Statut invalide'; end if;
  update public.tafa_profile_wall_posts
     set status=p_status,
         approved_at=case when p_status='approved' then now() else approved_at end,
         approved_by=case when p_status='approved' then auth.uid() else approved_by end
   where id=p_post_id and (profile_owner_id=auth.uid() or (p_status='deleted' and author_id=auth.uid()))
  returning * into row;
  if row.id is null then raise exception 'Action non autorisée ou publication introuvable'; end if;
  return row;
end;
$$;
revoke all on function public.tafa_moderate_profile_wall_post(uuid,text) from public;
grant execute on function public.tafa_moderate_profile_wall_post(uuid,text) to authenticated;

-- Realtime for profile-wall moderation/publication updates.
do $$
begin
  if to_regclass('public.tafa_profile_wall_posts') is not null then
    alter table public.tafa_profile_wall_posts replica identity full;
    begin
      alter publication supabase_realtime add table public.tafa_profile_wall_posts;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

commit;
