/* TAFAß — PAGE PERMISSION REPAIR
   Fixes: permission denied for table page_posts
   Safe to run: no DROP TABLE / DELETE / data loss.
*/

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.page_members,
  public.page_posts,
  public.page_post_reactions,
  public.page_post_comments,
  public.page_post_shares,
  public.page_messages
TO authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.page_followers TO authenticated;

-- Keep privileges on future tables created by the migration owner.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- Realtime requires the tables to remain in the publication.
ALTER TABLE public.page_posts REPLICA IDENTITY FULL;
ALTER TABLE public.page_post_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.page_post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.page_post_shares REPLICA IDENTITY FULL;
ALTER TABLE public.page_members REPLICA IDENTITY FULL;
ALTER TABLE public.page_messages REPLICA IDENTITY FULL;
ALTER TABLE public.page_followers REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'page_members','page_posts','page_post_reactions','page_post_comments',
    'page_post_shares','page_messages','page_followers'
  ] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

SELECT 'TAFAß PAGE PERMISSIONS + REALTIME FIXED' AS status;
