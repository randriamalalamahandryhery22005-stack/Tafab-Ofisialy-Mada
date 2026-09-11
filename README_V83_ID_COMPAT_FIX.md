# Tafaß V83.1 — ID compatibility fix

Fix for Supabase error: `column "id" does not exist`.

Cause: the Pages frontend was assuming `public.page_followers.id` exists. Some existing production databases may have the follower row identified only by `(page_id,user_id)`. V83.1 therefore uses the stable composite key for follower reads/deletes and does not query `page_followers.id`.

Apply:
1. Deploy the included frontend files.
2. Run `TAFASS_V83_CLEAN_PRODUCTION_CORE.sql` in Supabase.
3. Hard-refresh/clear the old service-worker cache once after deployment.

No follower data is deleted or recreated.
