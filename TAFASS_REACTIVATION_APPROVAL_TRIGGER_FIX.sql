-- ============================================================
-- TAFAß — RÉACTIVATION ADMINISTRATEUR — FIX TRIGGER FINAL
-- ============================================================
-- L'administrateur doit pouvoir réactiver un compte restreint.
-- Le trigger de protection ne doit pas bloquer une modification
-- effectuée par un administrateur authentifié.
-- Le PDP et le PDC existants ne sont jamais modifiés ici.
-- ============================================================

CREATE OR REPLACE FUNCTION public.tafa_block_restricted_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Un administrateur authentifié peut modifier le profil, notamment
  -- account_status='active' lors de l'approbation d'une réactivation.
  IF public.tafa_is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Un compte restreint ou bloqué ne peut pas être réactivé par son propriétaire.
  IF coalesce(OLD.account_status, 'active') IN ('restricted', 'blocked') THEN
    RAISE EXCEPTION 'Compte restreint ou bloqué';
  END IF;

  -- Protection des médias administratifs lors d'une modification du profil.
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.cover_url IS DISTINCT FROM OLD.cover_url THEN
    IF EXISTS (
      SELECT 1
      FROM public.tafa_admin_protected_media m
      WHERE m.media_url = NEW.avatar_url
         OR m.media_url = NEW.cover_url
    ) THEN
      NEW.account_status := 'restricted';

      -- Une seule demande pending par utilisateur : ne jamais provoquer
      -- une erreur de contrainte unique si une demande existe déjà.
      IF NOT EXISTS (
        SELECT 1
        FROM public.tafa_account_appeals a
        WHERE a.user_id = NEW.id
          AND a.status = 'pending'
      ) THEN
        INSERT INTO public.tafa_account_appeals(user_id, reason, status)
        VALUES (
          NEW.id,
          'Restriction automatique : utilisation d’une image protégée de l’administration sur le profil.',
          'pending'
        );
      END IF;

      RAISE EXCEPTION 'Image protégée de l’administration Tafaß';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tafa_block_restricted_profile_write_trg ON public.profiles;

CREATE TRIGGER tafa_block_restricted_profile_write_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.tafa_block_restricted_profile_write();

-- ============================================================
-- Fonction d'approbation : seul account_status est modifié.
-- ============================================================

DROP FUNCTION IF EXISTS public.tafa_admin_set_appeal_status(uuid,text);

CREATE FUNCTION public.tafa_admin_set_appeal_status(
  p_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_old_status text;
BEGIN
  IF NOT public.tafa_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;

  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_APPEAL_STATUS';
  END IF;

  SELECT user_id, status
    INTO v_user_id, v_old_status
  FROM public.tafa_account_appeals
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPEAL_NOT_FOUND';
  END IF;

  IF v_old_status <> 'pending' THEN
    RAISE EXCEPTION 'APPEAL_ALREADY_PROCESSED';
  END IF;

  IF p_status = 'approved' THEN
    -- Le trigger autorise cette écriture car auth.uid() est administrateur.
    -- avatar_url et cover_url restent inchangés.
    UPDATE public.profiles
       SET account_status = 'active'
     WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'USER_PROFILE_NOT_FOUND';
    END IF;
  END IF;

  UPDATE public.tafa_account_appeals
     SET status = p_status
   WHERE id = p_id;

  IF to_regclass('public.tafa_admin_audit_logs') IS NOT NULL THEN
    INSERT INTO public.tafa_admin_audit_logs(
      admin_id, action, target_type, target_id, details
    )
    VALUES(
      auth.uid(),
      CASE WHEN p_status = 'approved'
           THEN 'approve_account_reactivation'
           ELSE 'reject_account_reactivation'
      END,
      'account_appeal',
      p_id,
      jsonb_build_object(
        'user_id', v_user_id,
        'status', p_status
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'appeal_id', p_id,
    'user_id', v_user_id,
    'status', p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_admin_set_appeal_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_admin_set_appeal_status(uuid,text) TO authenticated;

-- Realtime pour l'appel traité et le changement d'état du profil.
DO $$
BEGIN
  IF to_regclass('public.tafa_account_appeals') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.tafa_account_appeals;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
