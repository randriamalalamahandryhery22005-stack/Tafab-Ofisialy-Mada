/*
  TAFAß V20 — Final Production Verification
  READ-ONLY verification. This script does not create, alter, drop, or delete data.
  Run in Supabase SQL Editor after V19 hardening has been applied.
*/

-- 1) Core tables: existence + RLS state.
WITH expected(table_name) AS (
  VALUES
    ('profiles'),('posts'),('comments'),('messages'),('notifications'),
    ('conversations'),('conversation_members'),('follows'),('friend_requests'),
    ('friendships'),('groups'),('group_members'),('pages'),('payment_transactions')
)
SELECT
  e.table_name,
  (c.oid IS NOT NULL) AS table_exists,
  COALESCE(c.relrowsecurity, false) AS rls_enabled
FROM expected e
LEFT JOIN pg_class c ON c.relname=e.table_name
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
ORDER BY e.table_name;

-- 2) Payment protection: policies currently visible in public schema.
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename='payment_transactions'
ORDER BY policyname;

-- 3) Realtime publication membership for important realtime tables.
WITH expected(table_name) AS (
  VALUES ('posts'),('comments'),('messages'),('notifications'),('conversations'),
         ('follows'),('groups'),('group_members'),('pages'),('payment_transactions')
)
SELECT
  e.table_name,
  EXISTS (
    SELECT 1
    FROM pg_publication_tables pt
    WHERE pt.pubname='supabase_realtime'
      AND pt.schemaname='public'
      AND pt.tablename=e.table_name
  ) AS realtime_enabled
FROM expected e
ORDER BY e.table_name;

-- 4) Replica identity for tables where UPDATE/DELETE realtime payloads matter.
WITH expected(table_name) AS (
  VALUES ('posts'),('comments'),('messages'),('notifications'),('conversations'),('payment_transactions')
)
SELECT
  e.table_name,
  CASE c.relreplident WHEN 'f' THEN 'FULL' WHEN 'd' THEN 'DEFAULT' WHEN 'i' THEN 'INDEX' WHEN 'n' THEN 'NOTHING' ELSE 'UNKNOWN' END AS replica_identity
FROM expected e
LEFT JOIN pg_class c ON c.relname=e.table_name
LEFT JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'
ORDER BY e.table_name;

-- 5) Storage buckets and whether they are public. No mutation.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

-- 6) Storage RLS policies (if storage schema is accessible to the SQL editor role).
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
ORDER BY policyname;

-- 7) Security-definer functions with their current search_path.
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  COALESCE((SELECT string_agg(setting, ',') FROM unnest(coalesce(p.proconfig,'{}'::text[])) setting WHERE setting LIKE 'search_path=%'),'') AS search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef=true
ORDER BY p.proname;

-- 8) Final marker.
SELECT 'TAFAß V20 verification script completed — inspect each result set above.' AS status;
