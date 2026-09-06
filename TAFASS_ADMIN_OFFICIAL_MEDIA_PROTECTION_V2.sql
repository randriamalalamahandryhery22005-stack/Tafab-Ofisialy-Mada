-- =========================================================
-- Tafaß — Protection des médias officiels de l'administration
-- Images, vidéos, publications et stories
-- Migration additive et sûre : aucune donnée existante n'est supprimée.
-- =========================================================

create extension if not exists pgcrypto;

-- Conservation de l'empreinte SHA-256 des médias des publications.
alter table public.posts add column if not exists media_sha256 text;
alter table public.stories add column if not exists media_sha256 text;

create index if not exists tafa_posts_media_sha256_idx
  on public.posts(media_sha256)
  where media_sha256 is not null;

create index if not exists tafa_stories_media_sha256_idx
  on public.stories(media_sha256)
  where media_sha256 is not null;

-- Table centrale des médias officiellement protégés.
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

create index if not exists tafa_protected_assets_sha256_idx
  on public.tafa_protected_assets(sha256);

-- Synchronisation de la table historique utilisée par l'ancien système.
create table if not exists public.tafa_admin_protected_media (
  id uuid primary key default gen_random_uuid(),
  sha256 text unique,
  media_kind text not null,
  media_url text,
  created_at timestamptz not null default now()
);

create index if not exists tafa_admin_protected_media_sha256_idx
  on public.tafa_admin_protected_media(sha256);

-- Enregistrement d'un média officiel.
CREATE OR REPLACE FUNCTION public.tafa_admin_register_media_hash(
  p_sha256 text,
  p_kind text,
  p_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.tafa_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Administrateur requis';
  END IF;

  IF nullif(trim(p_sha256),'') IS NULL THEN
    RAISE EXCEPTION 'Empreinte média invalide';
  END IF;

  INSERT INTO public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
  VALUES(auth.uid(),lower(trim(p_sha256)),coalesce(p_kind,'official_media'),p_url,true)
  ON CONFLICT (sha256,asset_kind)
  DO UPDATE SET asset_url=excluded.asset_url, active=true
  RETURNING id INTO v_id;

  INSERT INTO public.tafa_admin_protected_media(sha256,media_kind,media_url)
  VALUES(lower(trim(p_sha256)),coalesce(p_kind,'official_media'),p_url)
  ON CONFLICT (sha256)
  DO UPDATE SET media_kind=excluded.media_kind, media_url=excluded.media_url;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tafa_admin_register_media_hash(text,text,text) TO authenticated;

-- Vérification d'un média avant publication.
CREATE OR REPLACE FUNCTION public.tafa_moderation_check_media(
  p_sha256 text,
  p_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hit boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok',false,'message','Utilisateur non authentifié.');
  END IF;

  IF nullif(trim(p_sha256),'') IS NULL THEN
    RETURN jsonb_build_object('ok',true);
  END IF;

  v_hit := EXISTS (
    SELECT 1
    FROM public.tafa_protected_assets a
    WHERE a.active=true
      AND a.sha256=lower(trim(p_sha256))
      AND a.owner_id<>auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.tafa_admin_protected_media a
    WHERE a.sha256=lower(trim(p_sha256))
  );

  IF v_hit AND NOT public.tafa_is_admin(auth.uid()) THEN
    PERFORM public.tafa_suspend_account(
      auth.uid(),
      'protected_media',
      'Utilisation non autorisée d’un média officiel protégé de l’administration.'
    );

    RETURN jsonb_build_object(
      'ok',false,
      'suspended',true,
      'message','Compte suspendu : ce média appartient à un contenu officiel protégé. Une procédure de vérification et une approbation administrative sont requises.'
    );
  END IF;

  RETURN jsonb_build_object('ok',true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tafa_moderation_check_media(text,text) TO authenticated;

-- Sécurité serveur : si un administrateur publie un média avec une empreinte,
-- celui-ci devient automatiquement un média officiel protégé.
CREATE OR REPLACE FUNCTION public.tafa_auto_register_admin_post_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(new.media_sha256,'') <> ''
     AND public.tafa_is_admin(new.user_id)
     AND new.media_url IS NOT NULL THEN
    INSERT INTO public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
    VALUES(new.user_id,lower(trim(new.media_sha256)),
           CASE WHEN new.media_type='video' OR new.media_type='reel' THEN 'post_video' ELSE 'post_image' END,
           new.media_url,true)
    ON CONFLICT (sha256,asset_kind)
    DO UPDATE SET asset_url=excluded.asset_url,active=true;

    INSERT INTO public.tafa_admin_protected_media(sha256,media_kind,media_url)
    VALUES(lower(trim(new.media_sha256)),
           CASE WHEN new.media_type='video' OR new.media_type='reel' THEN 'post_video' ELSE 'post_image' END,
           new.media_url)
    ON CONFLICT (sha256)
    DO UPDATE SET media_url=excluded.media_url;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_tafa_auto_register_admin_post_media ON public.posts;
CREATE TRIGGER trg_tafa_auto_register_admin_post_media
AFTER INSERT OR UPDATE OF media_sha256,media_url,media_type ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.tafa_auto_register_admin_post_media();

-- Même protection pour les Stories.
CREATE OR REPLACE FUNCTION public.tafa_auto_register_admin_story_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(new.media_sha256,'') <> ''
     AND public.tafa_is_admin(new.user_id)
     AND new.media_url IS NOT NULL THEN
    INSERT INTO public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
    VALUES(new.user_id,lower(trim(new.media_sha256)),
           CASE WHEN new.media_type='video' THEN 'story_video' ELSE 'story_image' END,
           new.media_url,true)
    ON CONFLICT (sha256,asset_kind)
    DO UPDATE SET asset_url=excluded.asset_url,active=true;

    INSERT INTO public.tafa_admin_protected_media(sha256,media_kind,media_url)
    VALUES(lower(trim(new.media_sha256)),
           CASE WHEN new.media_type='video' THEN 'story_video' ELSE 'story_image' END,
           new.media_url)
    ON CONFLICT (sha256)
    DO UPDATE SET media_url=excluded.media_url;
  END IF;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_tafa_auto_register_admin_story_media ON public.stories;
CREATE TRIGGER trg_tafa_auto_register_admin_story_media
AFTER INSERT OR UPDATE OF media_sha256,media_url,media_type ON public.stories
FOR EACH ROW EXECUTE FUNCTION public.tafa_auto_register_admin_story_media();

-- Protection RLS des empreintes officielles.
alter table public.tafa_protected_assets enable row level security;
alter table public.tafa_admin_protected_media enable row level security;

drop policy if exists tafa_protected_assets_admin on public.tafa_protected_assets;
create policy tafa_protected_assets_admin
on public.tafa_protected_assets
for all to authenticated
using(public.tafa_is_admin(auth.uid()))
with check(public.tafa_is_admin(auth.uid()));

drop policy if exists tafa_admin_media_admin on public.tafa_admin_protected_media;
create policy tafa_admin_media_admin
on public.tafa_admin_protected_media
for all to authenticated
using(public.tafa_is_admin(auth.uid()))
with check(public.tafa_is_admin(auth.uid()));

grant select on public.tafa_protected_assets to authenticated;
grant select on public.tafa_admin_protected_media to authenticated;

-- Protection rétroactive des publications et stories déjà publiées par les admins,
-- uniquement lorsqu'une empreinte SHA-256 est déjà disponible.
INSERT INTO public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
SELECT p.user_id,lower(trim(p.media_sha256)),
       CASE WHEN p.media_type='video' OR p.media_type='reel' THEN 'post_video' ELSE 'post_image' END,
       p.media_url,true
FROM public.posts p
JOIN public.profiles pr ON pr.id=p.user_id
WHERE coalesce(pr.is_admin,false)=true
  AND nullif(trim(p.media_sha256),'') IS NOT NULL
  AND p.media_url IS NOT NULL
ON CONFLICT (sha256,asset_kind) DO NOTHING;

INSERT INTO public.tafa_admin_protected_media(sha256,media_kind,media_url)
SELECT lower(trim(p.media_sha256)),
       CASE WHEN p.media_type='video' OR p.media_type='reel' THEN 'post_video' ELSE 'post_image' END,
       p.media_url
FROM public.posts p
JOIN public.profiles pr ON pr.id=p.user_id
WHERE coalesce(pr.is_admin,false)=true
  AND nullif(trim(p.media_sha256),'') IS NOT NULL
  AND p.media_url IS NOT NULL
ON CONFLICT (sha256) DO NOTHING;

INSERT INTO public.tafa_protected_assets(owner_id,sha256,asset_kind,asset_url,active)
SELECT s.user_id,lower(trim(s.media_sha256)),
       CASE WHEN s.media_type='video' THEN 'story_video' ELSE 'story_image' END,
       s.media_url,true
FROM public.stories s
JOIN public.profiles pr ON pr.id=s.user_id
WHERE coalesce(pr.is_admin,false)=true
  AND nullif(trim(s.media_sha256),'') IS NOT NULL
  AND s.media_url IS NOT NULL
ON CONFLICT (sha256,asset_kind) DO NOTHING;

INSERT INTO public.tafa_admin_protected_media(sha256,media_kind,media_url)
SELECT lower(trim(s.media_sha256)),
       CASE WHEN s.media_type='video' THEN 'story_video' ELSE 'story_image' END,
       s.media_url
FROM public.stories s
JOIN public.profiles pr ON pr.id=s.user_id
WHERE coalesce(pr.is_admin,false)=true
  AND nullif(trim(s.media_sha256),'') IS NOT NULL
  AND s.media_url IS NOT NULL
ON CONFLICT (sha256) DO NOTHING;

-- =========================================================
-- Note : cette protection détecte les réuploads identiques.
-- Une image modifiée, recadrée ou recompressée nécessite une
-- détection perceptuelle séparée et ne doit pas être sanctionnée
-- automatiquement sans vérification humaine.
-- =========================================================
