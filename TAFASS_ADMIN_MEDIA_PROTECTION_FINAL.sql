/*
  TAFAß — PROTECTION FINALE DES MÉDIAS ADMINISTRATEUR
  Compatible à 100 % avec le schéma réel de posts/stories.

  IMPORTANT :
  - N'utilise PAS posts.media_sha256.
  - N'utilise PAS stories.media_sha256.
  - Ne supprime ni ne remplace tafa_is_admin(...).
  - Le hash SHA-256 est stocké uniquement dans tafa_admin_protected_media.
*/

create extension if not exists pgcrypto;

create table if not exists public.tafa_admin_protected_media (
  id uuid primary key default gen_random_uuid(),
  sha256 text unique,
  media_kind text not null,
  media_url text,
  created_at timestamptz not null default now()
);

create index if not exists tafa_admin_protected_media_sha256_idx
  on public.tafa_admin_protected_media(sha256);

create index if not exists tafa_admin_protected_media_url_idx
  on public.tafa_admin_protected_media(media_url);

create table if not exists public.tafa_account_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);

alter table public.tafa_admin_protected_media enable row level security;
alter table public.tafa_account_appeals enable row level security;

drop policy if exists tafa_admin_media_read on public.tafa_admin_protected_media;
create policy tafa_admin_media_read
  on public.tafa_admin_protected_media
  for select to authenticated
  using (true);

drop policy if exists tafa_appeals_self_select on public.tafa_account_appeals;
create policy tafa_appeals_self_select
  on public.tafa_account_appeals
  for select to authenticated
  using (user_id=auth.uid() or public.tafa_is_admin(auth.uid()));

/* Vérification SHA-256 avant upload/publication. */
create or replace function public.tafa_moderation_check_media(
  p_sha256 text,
  p_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_hash text := lower(trim(coalesce(p_sha256,'')));
  v_hit boolean := false;
  v_reason text := 'Restriction automatique : utilisation d’un média protégé de l’administration Tafaß.';
begin
  if uid is null then
    return jsonb_build_object(
      'ok',false,
      'message','Session Supabase requise pour vérifier le média.'
    );
  end if;

  if v_hash = '' then
    return jsonb_build_object(
      'ok',false,
      'message','Hash du média invalide : envoi refusé.'
    );
  end if;

  select exists(
    select 1
    from public.tafa_admin_protected_media m
    where lower(trim(m.sha256)) = v_hash
  ) into v_hit;

  if v_hit and not public.tafa_is_admin(uid) then
    update public.profiles
       set account_status='restricted',
           updated_at=now()
     where id=uid;

    if not exists(
      select 1
      from public.tafa_account_appeals a
      where a.user_id=uid
        and a.status='pending'
        and a.reason=v_reason
    ) then
      insert into public.tafa_account_appeals(user_id,reason,status)
      values(uid,v_reason,'pending');
    end if;

    return jsonb_build_object(
      'ok',false,
      'restricted',true,
      'message','Média protégé : votre compte a été restreint.'
    );
  end if;

  return jsonb_build_object('ok',true,'restricted',false);
end;
$$;

revoke all on function public.tafa_moderation_check_media(text,text) from public;
grant execute on function public.tafa_moderation_check_media(text,text) to authenticated;

/* Enregistrement réservé au compte administrateur officiel. */
create or replace function public.tafa_admin_register_media_hash(
  p_sha256 text,
  p_kind text,
  p_url text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.tafa_is_admin(auth.uid()) then
    raise exception 'Accès administrateur requis';
  end if;

  if nullif(trim(coalesce(p_sha256,'')),'') is null then
    raise exception 'Hash média invalide';
  end if;

  insert into public.tafa_admin_protected_media(
    sha256,
    media_kind,
    media_url
  )
  values(
    lower(trim(p_sha256)),
    coalesce(nullif(trim(p_kind),''),'media'),
    nullif(trim(p_url),'')
  )
  on conflict (sha256)
  do update set
    media_kind=excluded.media_kind,
    media_url=coalesce(excluded.media_url,public.tafa_admin_protected_media.media_url);

  return true;
end;
$$;

revoke all on function public.tafa_admin_register_media_hash(text,text,text) from public;
grant execute on function public.tafa_admin_register_media_hash(text,text,text) to authenticated;

/*
  Protection supplémentaire par URL.
  Elle protège aussi les anciens médias administrateur déjà enregistrés,
  même lorsqu'aucun hash n'est disponible.

  RETURN NULL annule l'insertion/la modification du contenu tout en laissant
  la mise à jour account_status='restricted' être conservée.
*/
create or replace function public.tafa_block_protected_post_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := 'Restriction automatique : publication d’un média protégé de l’administration Tafaß.';
begin
  if new.media_url is not null
     and not public.tafa_is_admin(new.user_id)
     and exists(
       select 1
       from public.tafa_admin_protected_media m
       where m.media_url=new.media_url
     ) then

    update public.profiles
       set account_status='restricted',
           updated_at=now()
     where id=new.user_id;

    if not exists(
      select 1 from public.tafa_account_appeals a
      where a.user_id=new.user_id
        and a.status='pending'
        and a.reason=v_reason
    ) then
      insert into public.tafa_account_appeals(user_id,reason,status)
      values(new.user_id,v_reason,'pending');
    end if;

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists tafa_block_protected_post_media_trg on public.posts;
create trigger tafa_block_protected_post_media_trg
before insert or update of media_url on public.posts
for each row
execute function public.tafa_block_protected_post_media();

/* Même protection pour les Stories. */
create or replace function public.tafa_block_protected_story_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := 'Restriction automatique : Story utilisant un média protégé de l’administration Tafaß.';
begin
  if new.media_url is not null
     and not public.tafa_is_admin(new.user_id)
     and exists(
       select 1
       from public.tafa_admin_protected_media m
       where m.media_url=new.media_url
     ) then

    update public.profiles
       set account_status='restricted',
           updated_at=now()
     where id=new.user_id;

    if not exists(
      select 1 from public.tafa_account_appeals a
      where a.user_id=new.user_id
        and a.status='pending'
        and a.reason=v_reason
    ) then
      insert into public.tafa_account_appeals(user_id,reason,status)
      values(new.user_id,v_reason,'pending');
    end if;

    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists tafa_block_protected_story_media_trg on public.stories;
create trigger tafa_block_protected_story_media_trg
before insert or update of media_url on public.stories
for each row
execute function public.tafa_block_protected_story_media();

/* Bloquer les écritures futures d'un compte déjà restreint. */
create or replace function public.tafa_block_restricted_story_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((select account_status from public.profiles where id=auth.uid()),'active') in ('restricted','blocked') then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists tafa_stories_restricted_write_trg on public.stories;
create trigger tafa_stories_restricted_write_trg
before insert or update on public.stories
for each row
execute function public.tafa_block_restricted_story_write();

/* Contrôle final : seules les tables réelles posts/stories sont utilisées. */
select column_name
from information_schema.columns
where table_schema='public'
  and table_name in ('posts','stories')
order by table_name,ordinal_position;
