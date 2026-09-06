/*
  Tafaß — Correction définitive des médias administrateur
  Objectif :
  - supprimer les anciennes lignes sans SHA-256 ;
  - empêcher toute nouvelle ligne sha256=NULL ;
  - désactiver l'ancien trigger V30 qui enregistrait avatar/cover sans hash ;
  - conserver l'enregistrement SHA-256 effectué par app.js ;
  - ne modifier ni posts ni stories, et ne pas toucher à tafa_is_admin().
*/

begin;

/* 1. Nettoyage des anciennes entrées incomplètes. */
delete from public.tafa_admin_protected_media
where sha256 is null;

/* 2. Aucun média protégé ne doit plus pouvoir être enregistré sans SHA-256. */
alter table public.tafa_admin_protected_media
  alter column sha256 set not null;

/* 3. L'ancien trigger V30 ne doit plus créer de doublon avec sha256=NULL.
      L'enregistrement officiel est maintenant fait par
      tafa_admin_register_media_hash() depuis l'application, avec le hash
      calculé à partir du fichier original. */
create or replace function public.tafa_register_admin_profile_media()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

/* Le trigger peut rester présent : la fonction ci-dessus est volontairement
   neutre afin de ne pas casser une dépendance existante. */
drop trigger if exists tafa_register_admin_profile_media_trg
on public.profiles;

create trigger tafa_register_admin_profile_media_trg
after insert or update of avatar_url, cover_url
on public.profiles
for each row
execute function public.tafa_register_admin_profile_media();

/* 4. Enregistrement sécurisé : SHA-256 obligatoire et normalisé. */
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
declare
  v_hash text := lower(trim(coalesce(p_sha256,'')));
begin
  if auth.uid() is null or not public.tafa_is_admin(auth.uid()) then
    raise exception 'Accès administrateur requis';
  end if;

  if v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Hash SHA-256 invalide';
  end if;

  insert into public.tafa_admin_protected_media(
    sha256,
    media_kind,
    media_url
  )
  values(
    v_hash,
    coalesce(nullif(trim(p_kind),''),'media'),
    nullif(trim(p_url),'')
  )
  on conflict (sha256)
  do update set
    media_kind = excluded.media_kind,
    media_url = coalesce(
      excluded.media_url,
      public.tafa_admin_protected_media.media_url
    );

  return true;
end;
$$;

revoke all on function public.tafa_admin_register_media_hash(text,text,text)
from public;

grant execute on function public.tafa_admin_register_media_hash(text,text,text)
to authenticated;

/* 5. Vérification finale : aucune entrée NULL ne doit exister. */
do $$
begin
  if exists(
    select 1
    from public.tafa_admin_protected_media
    where sha256 is null
  ) then
    raise exception 'Des médias protégés sans SHA-256 existent encore';
  end if;
end;
$$;

commit;

/* Résultat de contrôle */
select id, sha256, media_kind, media_url, created_at
from public.tafa_admin_protected_media
order by created_at desc;
