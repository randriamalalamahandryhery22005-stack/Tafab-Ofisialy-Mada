# Tafaß V17 — Full Production Hardening
Date: 2026-09-05

## Purpose
V17 continues the production hardening after the V16 static audit. The focus is reliable realtime recovery when an Android browser/PWA is backgrounded and later resumed.

## Changes
- Added a debounced `visibilitychange` realtime recovery path.
- When the app returns to the foreground while authenticated and online, Supabase realtime subscriptions are rebuilt through the existing `setupRealtime()` lifecycle.
- The recovery is delayed by 350 ms to avoid reconnect storms during rapid visibility changes.
- Preserved the existing private-content blur behavior.
- Bumped frontend cache assets to `?v=90`.
- Bumped service-worker cache namespace to `tafass-v17-shell-2026-09-05`.

## Static validation
- `node --check app.js`: PASS
- index/service-worker cache references: synchronized
- ZIP integrity: PASS after packaging

## Important production boundary
V17 does not falsely certify external services. Full live certification still requires the deployed HTTPS app and real Supabase/Firebase/OAuth/TURN/payment configuration. In particular, RLS, Storage, OAuth redirects, FCM, TURN and payment webhooks must be tested in the real project.

## Recommended live test
1. Login on Android.
2. Open Messages and keep a conversation open.
3. Put the browser/PWA in background for 30–60 seconds.
4. Send a message from another account/device.
5. Return to Tafaß and verify the realtime message appears without a manual reload.
6. Repeat with notifications, reactions, comments, Pages and Groups.
