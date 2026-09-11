# Tafaß V83 — Clean Production Core

## What changed
- One active frontend build identifier: `TAFAß-V83`.
- New service-worker cache namespace: `tafass-v83-production-core`.
- `index.html` cache-bust updated to `app.js?v=183` and `style.css?v=183`.
- Pages V82 presentation is retained as the current visual base but is now the V83 production Pages implementation; old V80 function names remain only as compatibility aliases for existing routes.
- Pages/Groups realtime is coordinated through one debounced subscription layer, preventing a burst of database events from causing repeated full reloads.
- Added a real `supabaseReady()` guard for the admin path.
- Mobile Page detail uses a dedicated touch scroll container and prevents horizontal overflow.
- Added V83 SQL hardening: admin `is_admin` ambiguity-safe RPC, indexes, private-group join-request fallback, RLS and realtime publication additions.

## SQL order
1. Keep the existing production schema and migrations already applied.
2. Run `TAFASS_V83_CLEAN_PRODUCTION_CORE.sql` once in Supabase SQL Editor.
3. Do not re-run the entire historical V19–V81 migration collection on an existing production database.

## Frontend deployment
Deploy the changed frontend files together:
- `index.html`
- `app.js`
- `style.css`
- `sw.js`
- `BUILD_INFO.txt`

After deployment, the V83 service worker uses a new cache namespace and network-first fetching so an old V80/V81/V82 asset is not intentionally retained.

## Verification
- `node --check app.js` passes.
- Search for stale `app.js?v=173` / `style.css?v=173` references before deployment.
- Verify Pages: open → scroll top/bottom → switch tab → follow/unfollow → publish → comment/reaction/share → realtime update from another account.
- Verify Groups: discover → join/request → open → realtime member/post update.
