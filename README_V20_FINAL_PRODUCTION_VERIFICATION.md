# Tafaß V20 — Final Production Verification & Bug Fix

Date: 2026-09-05

## Changes
- Removed the duplicate `visibilitychange` realtime recovery listener from V19. V18/V19 foreground recovery remains in one debounced handler, including secure-content blur handling.
- Bumped application assets to `app.js?v=120` and `style.css?v=120`.
- Bumped Service Worker cache namespace to `tafass-v20-shell-2026-09-05`.
- Added `TAFASS_V20_PRODUCTION_VERIFICATION.sql`, a **read-only** Supabase verification script.

## Verification targets
The SQL checks:
- expected core tables and RLS status;
- payment policies;
- Supabase Realtime publication membership;
- replica identity;
- Storage buckets and object policies;
- security-definer functions and their `search_path` settings.

## Important
This ZIP can be statically verified locally, but it cannot truthfully certify external production behavior without executing the verification against the deployed Supabase project and testing real provider configuration.

Do **not** run historical migrations again just for verification. V20's verification SQL is read-only.
