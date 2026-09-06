-- =========================================================
-- Tafaß — Protection réelle des médias officiels
-- Correction sans DROP de tafa_is_admin ni CASCADE
-- =========================================================

-- Vérification et blocage d'un média avant publication.
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
    v_hash text := lower(trim(coalesce(p_sha256, '')));
    v_hit boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN jsonb_build_object(
            'ok', false,
            'message', 'Utilisateur non authentifié.'
        );
    END IF;

    IF v_hash = '' THEN
        RETURN jsonb_build_object('ok', true);
    END IF;

    -- Un administrateur ne doit jamais être bloqué par son propre média.
    IF public.tafa_is_admin(auth.uid()) THEN
        RETURN jsonb_build_object('ok', true, 'protected', false);
    END IF;

    v_hit := EXISTS (
        SELECT 1
        FROM public.tafa_admin_protected_media a
        WHERE lower(a.sha256) = v_hash
    ) OR EXISTS (
        SELECT 1
        FROM public.tafa_protected_assets a
        WHERE a.active = true
          AND lower(a.sha256) = v_hash
          AND a.owner_id <> auth.uid()
    );

    IF v_hit THEN
        -- Restriction immédiate du compte fautif.
        UPDATE public.profiles
        SET account_status = 'restricted'
        WHERE id = auth.uid();

        RETURN jsonb_build_object(
            'ok', false,
            'protected', true,
            'suspended', true,
            'message', 'Compte restreint : utilisation non autorisée d’un média officiel protégé de Tafaß. Une procédure de vérification et une approbation administrative sont requises.'
        );
    END IF;

    RETURN jsonb_build_object('ok', true, 'protected', false);
END;
$$;

GRANT EXECUTE
ON FUNCTION public.tafa_moderation_check_media(text, text)
TO authenticated;


-- Enregistre automatiquement les images/vidéos publiées par un administrateur.
-- Cette protection ne dépend pas de l'interface JavaScript.
CREATE OR REPLACE FUNCTION public.tafa_auto_register_admin_post_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind text;
    v_hash text;
BEGIN
    v_hash := lower(trim(coalesce(new.media_sha256, '')));

    IF v_hash <> ''
       AND new.media_url IS NOT NULL
       AND public.tafa_is_admin(new.user_id) THEN

        v_kind := CASE
            WHEN lower(coalesce(new.media_type, '')) IN ('video', 'reel')
                THEN 'post_video'
            ELSE 'post_image'
        END;

        INSERT INTO public.tafa_admin_protected_media
            (sha256, media_kind, media_url)
        VALUES
            (v_hash, v_kind, new.media_url)
        ON CONFLICT (sha256)
        DO UPDATE SET
            media_kind = EXCLUDED.media_kind,
            media_url = EXCLUDED.media_url;

        INSERT INTO public.tafa_protected_assets
            (owner_id, sha256, asset_kind, asset_url, active)
        VALUES
            (new.user_id, v_hash, v_kind, new.media_url, true)
        ON CONFLICT (sha256, asset_kind)
        DO UPDATE SET
            asset_url = EXCLUDED.asset_url,
            active = true;
    END IF;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_tafa_auto_register_admin_post_media
ON public.posts;

CREATE TRIGGER trg_tafa_auto_register_admin_post_media
AFTER INSERT OR UPDATE OF media_sha256, media_url, media_type
ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.tafa_auto_register_admin_post_media();


-- Même protection pour les Stories.
CREATE OR REPLACE FUNCTION public.tafa_auto_register_admin_story_media()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_kind text;
    v_hash text;
BEGIN
    v_hash := lower(trim(coalesce(new.media_sha256, '')));

    IF v_hash <> ''
       AND new.media_url IS NOT NULL
       AND public.tafa_is_admin(new.user_id) THEN

        v_kind := CASE
            WHEN lower(coalesce(new.media_type, '')) = 'video'
                THEN 'story_video'
            ELSE 'story_image'
        END;

        INSERT INTO public.tafa_admin_protected_media
            (sha256, media_kind, media_url)
        VALUES
            (v_hash, v_kind, new.media_url)
        ON CONFLICT (sha256)
        DO UPDATE SET
            media_kind = EXCLUDED.media_kind,
            media_url = EXCLUDED.media_url;

        INSERT INTO public.tafa_protected_assets
            (owner_id, sha256, asset_kind, asset_url, active)
        VALUES
            (new.user_id, v_hash, v_kind, new.media_url, true)
        ON CONFLICT (sha256, asset_kind)
        DO UPDATE SET
            asset_url = EXCLUDED.asset_url,
            active = true;
    END IF;

    RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_tafa_auto_register_admin_story_media
ON public.stories;

CREATE TRIGGER trg_tafa_auto_register_admin_story_media
AFTER INSERT OR UPDATE OF media_sha256, media_url, media_type
ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.tafa_auto_register_admin_story_media();


-- =========================================================
-- Protection rétroactive des médias Admin déjà enregistrés
-- avec une empreinte SHA-256.
-- =========================================================

INSERT INTO public.tafa_admin_protected_media
    (sha256, media_kind, media_url)
SELECT
    lower(trim(p.media_sha256)),
    CASE
        WHEN lower(coalesce(p.media_type, '')) IN ('video', 'reel')
            THEN 'post_video'
        ELSE 'post_image'
    END,
    p.media_url
FROM public.posts p
WHERE nullif(trim(p.media_sha256), '') IS NOT NULL
  AND p.media_url IS NOT NULL
  AND public.tafa_is_admin(p.user_id)
ON CONFLICT (sha256)
DO UPDATE SET
    media_kind = EXCLUDED.media_kind,
    media_url = EXCLUDED.media_url;

INSERT INTO public.tafa_admin_protected_media
    (sha256, media_kind, media_url)
SELECT
    lower(trim(s.media_sha256)),
    CASE
        WHEN lower(coalesce(s.media_type, '')) = 'video'
            THEN 'story_video'
        ELSE 'story_image'
    END,
    s.media_url
FROM public.stories s
WHERE nullif(trim(s.media_sha256), '') IS NOT NULL
  AND s.media_url IS NOT NULL
  AND public.tafa_is_admin(s.user_id)
ON CONFLICT (sha256)
DO UPDATE SET
    media_kind = EXCLUDED.media_kind,
    media_url = EXCLUDED.media_url;

-- =========================================================
-- Fin
-- =========================================================
