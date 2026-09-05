/*
  TAFAß V19 — Production Security Hardening
  Safe migration: no DROP TABLE, no destructive data changes.
  Run once in Supabase SQL Editor on the production project.

  Important: RLS/storage/provider configuration remains environment-specific.
*/

-- 1) Payment records: authenticated users may only see/create their own requests.
DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS payment_transactions_select ON public.payment_transactions';
    EXECUTE 'DROP POLICY IF EXISTS payment_transactions_insert ON public.payment_transactions';
    EXECUTE 'CREATE POLICY payment_transactions_select ON public.payment_transactions FOR SELECT TO authenticated USING (user_id = auth.uid())';
    EXECUTE 'CREATE POLICY payment_transactions_insert ON public.payment_transactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND status = ''pending'' AND currency = ''MGA'')';
  END IF;
END $$;

-- 2) Prevent client-side users from changing payment status/ownership.
--    The frontend only creates pending requests. Validation/settlement must be
--    performed by a trusted backend/admin path, never by the public client key.
DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS payment_transactions_update ON public.payment_transactions';
    EXECUTE 'DROP POLICY IF EXISTS payment_transactions_delete ON public.payment_transactions';
  END IF;
END $$;

-- 3) Realtime publication for payment status/history when the table exists.
DO $$
BEGIN
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    EXECUTE 'ALTER TABLE public.payment_transactions REPLICA IDENTITY FULL';
  END IF;
END $$;

-- 4) Keep security-definer helpers pinned to a known search path where present.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS function_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef=true
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.schema_name, r.function_name, r.args);
    EXCEPTION WHEN undefined_function OR insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;

-- 5) Useful indexes without changing application semantics.
CREATE INDEX IF NOT EXISTS payment_transactions_user_status_created_idx
  ON public.payment_transactions(user_id,status,created_at DESC);

-- 6) Ask PostgREST to reload its schema cache.
NOTIFY pgrst, 'reload schema';

SELECT 'TAFAß V19 production security hardening migration prepared/applied.' AS status;
