-- ============================================================
-- Tafaß — ADMIN DASHBOARD / ACCESS FIX
-- Ne modifie pas et ne supprime pas tafa_is_admin(uuid)
-- ============================================================

-- Fonction d'accès Admin utilisée par le Dashboard.
-- Elle réutilise la fonction tafa_is_admin(uuid) déjà présente
-- dans la base afin de préserver les policies RLS existantes.

CREATE OR REPLACE FUNCTION public.tafa_is_admin_actor(
    p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.tafa_is_admin(p_user_id);
$$;

GRANT EXECUTE
ON FUNCTION public.tafa_is_admin_actor(uuid)
TO authenticated;

-- ============================================================
-- Vérification : aucune suppression de fonction ni de policy.
-- ============================================================

-- Reels : utiliser media_type.
-- ============================================================
