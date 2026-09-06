/*
  Tafaß — Correction définitive de la réactivation des comptes
  Objectifs :
  - permettre à l'administration d'approuver réellement une demande ;
  - ne jamais effacer avatar_url ni cover_url lors de la réactivation ;
  - empêcher plusieurs demandes de réactivation simultanées ;
  - conserver le temps réel via Supabase Realtime ;
  - ne pas modifier posts/stories ni tafa_is_admin().
*/

begin;

/* =========================================================
   1. Le garde-profil doit autoriser une modification faite
      par l'administration, même si le compte cible est restreint.
   ========================================================= */
create or replace function public.tafa_block_restricted_profile_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /* Une action administrative peut réactiver le compte sans toucher
     aux informations de profil existantes. */
  if public.tafa_is_admin(auth.uid()) then
    return new;
  end if;

  if coalesce(old.account_status,'active') in ('restricted','blocked') then
    raise exception 'Compte restreint ou bloqué';
  end if;

  if new.avatar_url is distinct from old.avatar_url
     or new.cover_url is distinct from old.cover_url then
    if exists(
      select 1
      from public.tafa_admin_protected_media m
      where m.media_url = new.avatar_url
         or m.media_url = new.cover_url
    ) then
      new.account_status='restricted';
      insert into public.tafa_account_appeals(user_id,reason,status)
      select new.id,
             'Restriction automatique : utilisation d’une image protégée de l’administration sur le profil.',
             'pending'
      where not exists(
        select 1 from public.tafa_account_appeals a
        where a.user_id=new.id and a.status='pending'
      );
      raise exception 'Image protégée de l’administration Tafaß';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tafa_block_restricted_profile_write_trg
on public.profiles;

create trigger tafa_block_restricted_profile_write_trg
before update on public.profiles
for each row
execute function public.tafa_block_restricted_profile_write();

/* =========================================================
   2. Une seule demande de réactivation peut être PENDING.
      Une nouvelle demande pourra être créée après un refus.
   ========================================================= */
create or replace function public.tafa_submit_account_appeal(p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  aid uuid;
begin
  if uid is null then
    raise exception 'Non authentifié';
  end if;

  if coalesce((select account_status from public.profiles where id=uid),'active')
     not in ('restricted','blocked') then
    raise exception 'Votre compte ne nécessite pas de réactivation';
  end if;

  if exists(
    select 1
    from public.tafa_account_appeals
    where user_id=uid and status='pending'
  ) then
    raise exception 'Une demande de réactivation est déjà en cours. Vous ne pouvez pas en envoyer plusieurs.';
  end if;

  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'Expliquez votre demande.';
  end if;

  insert into public.tafa_account_appeals(user_id,reason,status)
  values(uid,left(trim(p_reason),1000),'pending')
  returning id into aid;

  return aid;
end;
$$;

grant execute on function public.tafa_submit_account_appeal(text) to authenticated;

/* =========================================================
   3. Approbation administrative réelle.
      IMPORTANT : seul account_status est modifié sur profiles.
      avatar_url et cover_url restent donc exactement inchangés.
   ========================================================= */
create or replace function public.tafa_admin_set_appeal_status(
  p_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  current_status text;
begin
  if not public.tafa_is_admin(auth.uid()) then
    raise exception 'Accès administrateur requis';
  end if;

  if p_status not in ('approved','rejected') then
    raise exception 'Statut invalide';
  end if;

  select user_id, status
    into uid, current_status
  from public.tafa_account_appeals
  where id=p_id
  for update;

  if uid is null then
    raise exception 'Demande introuvable';
  end if;

  if current_status <> 'pending' then
    raise exception 'Cette demande a déjà été traitée';
  end if;

  /* Traitement de la demande. */
  update public.tafa_account_appeals
  set status=p_status,
      processed_at=now(),
      processed_by=auth.uid()
  where id=p_id;

  if p_status='approved' then
    /* NE PAS modifier avatar_url ni cover_url. */
    update public.profiles
    set account_status='active'
    where id=uid;
  end if;

  return true;
end;
$$;

grant execute on function public.tafa_admin_set_appeal_status(uuid,text) to authenticated;

/* =========================================================
   4. Protection contre plusieurs demandes PENDING au niveau
      base de données, même si plusieurs appareils envoient
      simultanément la demande.
   ========================================================= */
create unique index if not exists tafa_account_appeals_one_pending_per_user_idx
on public.tafa_account_appeals(user_id)
where status='pending';

/* =========================================================
   5. Realtime : demandes + profils.
   ========================================================= */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='tafa_account_appeals'
  ) then
    execute 'alter publication supabase_realtime add table public.tafa_account_appeals';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
exception when undefined_object then
  null;
end;
$$;

commit;

/* Contrôles */
select id,user_id,status,created_at,processed_at,processed_by
from public.tafa_account_appeals
order by created_at desc
limit 20;

select id,account_status,avatar_url,cover_url
from public.profiles
where id in (
  select user_id from public.tafa_account_appeals order by created_at desc limit 10
);
