-- ============================================================
-- TAFAß — RÉACTIVATION ADMINISTRATEUR — FIX FINAL
-- ============================================================
-- L'approbation modifie uniquement account_status.
-- avatar_url et cover_url restent strictement inchangés.
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

  IF p_status NOT IN ('approved','rejected') THEN
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
    -- Réactivation réelle : seul account_status est modifié.
    -- Le PDP et le PDC existants sont conservés.
    UPDATE public.profiles
       SET account_status = 'active'
     WHERE id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'USER_PROFILE_NOT_FOUND';
    END IF;
  END IF;

  -- Le refus ne modifie jamais le profil.
  UPDATE public.tafa_account_appeals
     SET status = p_status
   WHERE id = p_id;

  IF to_regclass('public.tafa_admin_audit_logs') IS NOT NULL THEN
    INSERT INTO public.tafa_admin_audit_logs(
      admin_id, action, target_type, target_id, details
    )
    VALUES(
      auth.uid(),
      CASE WHEN p_status='approved'
           THEN 'approve_account_reactivation'
           ELSE 'reject_account_reactivation'
      END,
      'account_appeal',
      p_id,
      jsonb_build_object('user_id',v_user_id,'status',p_status)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',true,
    'appeal_id',p_id,
    'user_id',v_user_id,
    'status',p_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_admin_set_appeal_status(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_admin_set_appeal_status(uuid,text) TO authenticated;

-- Realtime pour le compte réactivé et pour le centre Admin.
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

-- Contrôle : aucune duplication de pending ne doit exister.
SELECT user_id, count(*) AS pending_count
FROM public.tafa_account_appeals
WHERE status='pending'
GROUP BY user_id
HAVING count(*) > 1;
