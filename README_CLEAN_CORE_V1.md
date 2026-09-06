# Tafaß — CLEAN CORE V1

This package separates the production runtime from historical SQL patches.

## Active database script
Use only:
- `supabase/TAFASS_COMPLETE_SCHEMA.sql`

Do NOT execute files in `supabase/archive/` as a batch. They are historical/additive patches retained for audit and dependency review.

## Verification
- `supabase/VERIFY_PRODUCTION_READONLY.sql` is read-only and can be used to inspect the deployed Supabase project.

## Runtime
- `index.html`
- `app.js`
- `style.css`
- `sw.js`
- `manifest.webmanifest`
- `assets/`

## Current cleanup decision
- Removed `app.js.bak` and `style.css.bak` from the deploy package.
- Removed the duplicate `TAFASS_FINAL_COMPLETE_REALTIME.sql` from active SQL. It was byte-identical to `TAFASS_COMPLETE_SCHEMA.sql`.
- Historical SQL remains archived so no work is lost.

## Next phase
Before adding more UI features, reconcile the tables/RPCs used by `app.js` with the canonical schema and the archived patches. Then create one ordered migration for the missing production objects.
