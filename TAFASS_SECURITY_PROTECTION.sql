-- =========================================================
-- Tafaß — Protection des identités officielles + sanctions
-- À exécuter après le SQL précédent.
-- =========================================================

create extension if not exists unaccent;

-- Actifs protégés : identité, avatar, couverture, médias officiels.
create table if not exists public.tafa_protected_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  protected_name text not null,
  protected_username text,
  reason text not null default 'Compte administrateur ou vérifié',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafa_protected_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  sha256 text not null,
  asset_kind text not null,
  asset_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(sha256, asset_kind)
);

create index if not exists tafa_protected_identities_name_idx
  on public.tafa_protected_identities(lower(protected_name));
create index if not exists tafa_protected_identities_username_idx
  on public.tafa_protected_identities(lower(protected_username));
create index if not exists tafa_protected_assets_hash_idx
  on public.tafa_protected_assets(sha256);

-- Étapes de sanction et demandes de réactivation.
create table if not exists public.tafa_enforcement_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  violation_type text not null,
  reason text not null,
  status text not null default 'suspended',
  current_step integer not null default 1,
  admin_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafa_enforcement_steps (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tafa_enforcement_cases(id) on delete cascade,
  step_no integer not null,
  step_key text not null,
  status text not null default 'pending',
  note text,
  completed_at timestamptz,
  unique(case_id, step_no)
);

create index if not exists tafa_enforcement_user_idx
  on public.tafa_enforcement_cases(user_id, created_at desc);

-- Colonnes utilisées pour conserver la preuve technique du média.
alter table public.posts add column if not exists media_sha256 text;
alter table public.stories add column if not exists media_sha256 text;
alter table public.profiles add column if not exists avatar_sha256 text;
alter table public.profiles add column if not exists cover_sha256 text;

-- Partages devenus de vraies republications.
alter table public.group_posts add column if not exists shared_from_group_post_id uuid;
alter table public.group_posts add column if not exists shared_from_user_id uuid;
alter table public.group_posts add column if not exists shared_from_user_name text;
alter table public.group_posts add column if not exists shared_from_group_name text;

-- Sécuriser les fonctions d'application.
create or replace function public.tafa_normalize_identity(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(trim(public.unaccent(coalesce(p_value,'')))), '\\s+', ' ', 'g');
$$;

create or replace function public.tafa_is_admin_actor(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.profiles p
    where p.id = p_user_id
      and (coalesce(p.is_admin,false)=true or coalesce(p.admin_badge,false)=true)
  );
$$;

-- Synchronise automatiquement les identités officielles.
create or replace function public.tafa_sync_protected_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_admin,false)=true or coalesce(new.admin_badge,false)=true or coalesce(new.is_verified,false)=true then
    insert into public.tafa_protected_identities(user_id,protected_name,protected_username,reason,active,updated_at)
    values(
      new.id,
      concat_ws(' ',nullif(new.first_name,''),nullif(new.last_name,'')),
      nullif(new.username,''),
      case when coalesce(new.is_admin,false) or coalesce(new.admin_badge,false)
           then 'Compte administrateur officiel Tafaß'
           else 'Compte vérifié Tafaß' end,
      true,now()
    )
    on conflict(user_id) do update set
      protected_name=excluded.protected_name,
      protected_username=excluded.protected_username,
      reason=excluded.reason,
      active=true,
      updated_at=now();
  else
    update public.tafa_protected_identities set active=false,updated_at=now() where user_id=new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tafa_sync_protected_identity on public.profiles;
create trigger trg_tafa_sync_protected_identity
after insert or update of first_name,last_name,username,is_admin,admin_badge,is_verified
on public.profiles
for each row execute function public.tafa_sync_protected_identity();

-- Suspension centralisée. Le compte ne peut revenir actif qu'après validation admin.
create or replace function public.tafa_suspend_account(
  p_user_id uuid,
  p_violation_type text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  case_id uuid;
begin
  if p_user_id is null then raise exception 'Utilisateur invalide'; end if;
  if public.tafa_is_admin_actor(p_user_id) then
    raise exception 'Le compte administrateur officiel ne peut pas être suspendu par ce mécanisme';
  end if;

  insert into public.tafa_enforcement_cases(user_id,violation_type,reason,status,current_step,admin_approved)
  values(p_user_id,p_violation_type,p_reason,'suspended',1,false)
  returning id into case_id;

  insert into public.tafa_enforcement_steps(case_id,step_no,step_key,status,note)
  values
    (case_id,1,'suspension','completed','Compte suspendu immédiatement'),
    (case_id,2,'verification','pending','Vérification de l’identité et des éléments concernés'),
    (case_id,3,'explanation','pending','Le titulaire peut expliquer la situation'),
    (case_id,4,'review','pending','Examen administratif'),
    (case_id,5,'approval','pending','Approbation finale obligatoire de l’administration');

  update public.profiles
  set account_status='restricted', updated_at=now()
  where id=p_user_id;

  return case_id;
end;
$$;

-- Contrôle de nom / username / média avant toute action sensible.
create or replace function public.tafa_identity_guard(
  p_user_id uuid,
  p_first_name text default null,
  p_last_name text default null,
  p_username text default null,
  p_media_hash text default null,
  p_context text default 'content'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_name text;
  wanted_username text;
  protected public.tafa_protected_identities%rowtype;
  asset public.tafa_protected_assets%rowtype;
  reason text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Accès non autorisé';
  end if;

  if public.tafa_is_admin_actor(p_user_id) then
    return jsonb_build_object('allowed',true,'protected',true);
  end if;

  wanted_name:=public.tafa_normalize_identity(concat_ws(' ',nullif(p_first_name,''),nullif(p_last_name,'')));
  wanted_username:=public.tafa_normalize_identity(p_username);

  select * into protected
  from public.tafa_protected_identities x
  where x.active=true and x.user_id<>p_user_id
    and (
      (wanted_name<>'' and public.tafa_normalize_identity(x.protected_name)=wanted_name)
      or (wanted_username<>'' and public.tafa_normalize_identity(x.protected_username)=wanted_username)
    )
  limit 1;

  if protected.id is not null then
    reason:=format('Usurpation potentielle de l’identité protégée « %s » (%s).',protected.protected_name,p_context);
    perform public.tafa_suspend_account(p_user_id,'identity_impersonation',reason);
    return jsonb_build_object('allowed',false,'suspended',true,'message','Compte suspendu : utilisation d’une identité protégée. Une procédure de vérification et une approbation administrative sont requises.');
  end if;

  if nullif(trim(p_media_hash),'') is not null then
    select * into asset from public.tafa_protected_assets a
    where a.active=true and a.owner_id<>p_user_id and a.sha256=lower(trim(p_media_hash))
    limit 1;
    if asset.id is not null then
      reason:=format('Utilisation d’un média officiel protégé (%s).',p_context);
      perform public.tafa_suspend_account(p_user_id,'protected_media',reason);
      return jsonb_build_object('allowed',false,'suspended',true,'message','Compte suspendu : utilisation d’un média officiel protégé. Une procédure de vérification et une approbation administrative sont requises.');
    end if;
  end if;

  return jsonb_build_object('allowed',true,'protected',false);
end;
$$;

grant execute on function public.tafa_identity_guard(uuid,text,text,text,text,text) to authenticated;

-- Enregistrement d’un média officiel par l’administration.
create or replace function public.tafa_admin_register_media_hash(
  p_sha256 text,
  p_kind text,
  p_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare id_out uuid;
begin
  if not public.tafa_is_admin_actor(auth.uid()) then raise exception 'Administrateur requis'; end if;
  insert into public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
  values(auth.uid(),lower(trim(p_sha256)),coalesce(p_kind,'media'),p_url,true)
  on conflict(sha256,asset_kind) do update set asset_url=excluded.asset_url,active=true
  returning id into id_out;
  return id_out;
end;
$$;

grant execute on function public.tafa_admin_register_media_hash(text,text,text) to authenticated;

-- Garde serveur sur les médias déjà enregistrés dans posts/stories.
create or replace function public.tafa_guard_content_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.media_sha256),'') is not null
     and exists(select 1 from public.tafa_protected_assets a where a.active=true and a.owner_id<>new.user_id and a.sha256=lower(trim(new.media_sha256))) then
    perform public.tafa_suspend_account(new.user_id,'protected_media','Utilisation d’un média officiel protégé.');
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tafa_guard_posts_media on public.posts;
create trigger trg_tafa_guard_posts_media
before insert or update on public.posts
for each row execute function public.tafa_guard_content_media();

drop trigger if exists trg_tafa_guard_stories_media on public.stories;
create trigger trg_tafa_guard_stories_media
before insert or update on public.stories
for each row execute function public.tafa_guard_content_media();

-- Empêcher le changement direct vers le nom/username d’une identité protégée.
create or replace function public.tafa_guard_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare hit boolean;
begin
  if public.tafa_is_admin_actor(new.id) then return new; end if;
  select exists(
    select 1 from public.tafa_protected_identities x
    where x.active=true and x.user_id<>new.id
      and (
        (public.tafa_normalize_identity(concat_ws(' ',new.first_name,new.last_name))<>'' and public.tafa_normalize_identity(x.protected_name)=public.tafa_normalize_identity(concat_ws(' ',new.first_name,new.last_name)))
        or (nullif(trim(new.username),'') is not null and public.tafa_normalize_identity(x.protected_username)=public.tafa_normalize_identity(new.username))
      )
  ) into hit;
  if hit then
    perform public.tafa_suspend_account(new.id,'identity_impersonation','Tentative de reprise d’une identité officielle protégée.');
    new.account_status:='restricted';
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tafa_guard_profile_identity on public.profiles;
create trigger trg_tafa_guard_profile_identity
before insert or update of first_name,last_name,username on public.profiles
for each row execute function public.tafa_guard_profile_identity();

-- RLS des tables de sécurité : lecture réservée à l’administration, sauf ses propres demandes/cas.
alter table public.tafa_protected_identities enable row level security;
alter table public.tafa_protected_assets enable row level security;
alter table public.tafa_enforcement_cases enable row level security;
alter table public.tafa_enforcement_steps enable row level security;

drop policy if exists tafa_protected_identities_admin on public.tafa_protected_identities;
create policy tafa_protected_identities_admin on public.tafa_protected_identities
for all to authenticated using(public.tafa_is_admin_actor(auth.uid())) with check(public.tafa_is_admin_actor(auth.uid()));

drop policy if exists tafa_protected_assets_admin on public.tafa_protected_assets;
create policy tafa_protected_assets_admin on public.tafa_protected_assets
for all to authenticated using(public.tafa_is_admin_actor(auth.uid())) with check(public.tafa_is_admin_actor(auth.uid()));

drop policy if exists tafa_enforcement_cases_user_admin on public.tafa_enforcement_cases;
create policy tafa_enforcement_cases_user_admin on public.tafa_enforcement_cases
for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin_actor(auth.uid()));

drop policy if exists tafa_enforcement_steps_user_admin on public.tafa_enforcement_steps;
create policy tafa_enforcement_steps_user_admin on public.tafa_enforcement_steps
for select to authenticated using(exists(select 1 from public.tafa_enforcement_cases c where c.id=case_id and (c.user_id=auth.uid() or public.tafa_is_admin_actor(auth.uid()))));

-- Permissions minimales nécessaires aux fonctions SECURITY DEFINER.
grant select on public.tafa_protected_identities to authenticated;
grant select on public.tafa_protected_assets to authenticated;
grant select on public.tafa_enforcement_cases to authenticated;
grant select on public.tafa_enforcement_steps to authenticated;

-- Garde utilisé par l’application à l’entrée des actions sensibles.
create or replace function public.tafa_account_guard(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare st text;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Utilisateur non authentifié'; end if;
  select account_status into st from public.profiles where id=p_user_id;
  if coalesce(st,'active')='restricted' then
    return jsonb_build_object('allowed',false,'status','restricted','message','Compte suspendu. Une procédure de vérification et une approbation administrative sont requises.');
  end if;
  return jsonb_build_object('allowed',true,'status',coalesce(st,'active'));
end;
$$;
grant execute on function public.tafa_account_guard(uuid) to authenticated;

-- Table d'appels de réactivation, conservée compatible avec l'écran existant.
create table if not exists public.tafa_account_appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);
create index if not exists tafa_account_appeals_user_idx on public.tafa_account_appeals(user_id,created_at desc);
alter table public.tafa_account_appeals enable row level security;

drop policy if exists tafa_account_appeals_select on public.tafa_account_appeals;
create policy tafa_account_appeals_select on public.tafa_account_appeals
for select to authenticated using(user_id=auth.uid() or public.tafa_is_admin_actor(auth.uid()));

drop policy if exists tafa_account_appeals_insert on public.tafa_account_appeals;
create policy tafa_account_appeals_insert on public.tafa_account_appeals
for insert to authenticated with check(user_id=auth.uid());

grant select,insert on public.tafa_account_appeals to authenticated;

create or replace function public.tafa_submit_account_appeal(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare aid uuid;
begin
  if auth.uid() is null then raise exception 'Utilisateur non authentifié'; end if;
  if coalesce((select account_status from public.profiles where id=auth.uid()),'active')<>'restricted' then
    raise exception 'Votre compte ne nécessite pas de réactivation';
  end if;
  insert into public.tafa_account_appeals(user_id,reason,status)
  values(auth.uid(),left(trim(coalesce(p_reason,'')),1000),'pending') returning id into aid;
  return aid;
end;
$$;
grant execute on function public.tafa_submit_account_appeal(text) to authenticated;

create or replace function public.tafa_admin_set_appeal_status(p_id uuid,p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare aid uuid; uid uuid; cid uuid;
begin
  if not public.tafa_is_admin_actor(auth.uid()) then raise exception 'Administrateur requis'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Statut invalide'; end if;
  select user_id into uid from public.tafa_account_appeals where id=p_id for update;
  if uid is null then raise exception 'Demande introuvable'; end if;
  update public.tafa_account_appeals set status=p_status,reviewed_at=now(),reviewed_by=auth.uid() where id=p_id;
  select id into cid from public.tafa_enforcement_cases where user_id=uid and status='suspended' order by created_at desc limit 1;
  if p_status='approved' then
    update public.profiles set account_status='active',updated_at=now() where id=uid;
    if cid is not null then
      update public.tafa_enforcement_cases set status='approved',current_step=5,admin_approved=true,updated_at=now() where id=cid;
      update public.tafa_enforcement_steps set status='completed',completed_at=now() where case_id=cid and step_no in (2,3,4,5);
    end if;
  end if;
  return true;
end;
$$;
grant execute on function public.tafa_admin_set_appeal_status(uuid,text) to authenticated;

-- Suppression d'un commentaire : auteur du commentaire OU propriétaire de la publication.
-- La suppression ne touche que le commentaire ciblé et ses propres réponses.
create or replace function public.tafa_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare c_user uuid; p_user uuid; pid uuid;
begin
  select c.user_id,c.post_id into c_user,pid from public.comments c where c.id=p_comment_id for update;
  if c_user is null then raise exception 'Commentaire introuvable'; end if;
  select p.user_id into p_user from public.posts p where p.id=pid;
  if auth.uid()<>c_user and auth.uid()<>p_user then raise exception 'Vous ne pouvez supprimer que votre commentaire ou un commentaire de votre publication'; end if;
  delete from public.comments where id=p_comment_id or parent_id=p_comment_id;
  return true;
end;
$$;
grant execute on function public.tafa_delete_comment(uuid) to authenticated;

-- Initialiser immédiatement les comptes déjà administrateurs/vérifiés.
insert into public.tafa_protected_identities(user_id,protected_name,protected_username,reason,active)
select p.id,
       concat_ws(' ',nullif(p.first_name,''),nullif(p.last_name,'')),
       nullif(p.username,''),
       case when coalesce(p.is_admin,false) or coalesce(p.admin_badge,false)
            then 'Compte administrateur officiel Tafaß' else 'Compte vérifié Tafaß' end,
       true
from public.profiles p
where coalesce(p.is_admin,false)=true
   or coalesce(p.admin_badge,false)=true
   or coalesce(p.is_verified,false)=true
on conflict(user_id) do update set
  protected_name=excluded.protected_name,
  protected_username=excluded.protected_username,
  reason=excluded.reason,
  active=true,
  updated_at=now();
