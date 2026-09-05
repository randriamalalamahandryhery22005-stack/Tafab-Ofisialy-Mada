# Tafaß V18 — Full Production Reliability + End-to-End Hardening

Date: 2026-09-05

## Goal
V18 is a reliability pass on top of V17. It does not claim that external provider configuration can be certified from a ZIP alone.

## Implemented
- Android/PWA foreground recovery after background suspension.
- Session verification with Supabase before rebuilding realtime channels.
- Realtime channel reconstruction without forcing logout or resetting the current route.
- Live-feed realtime recovery after foreground return.
- Debounced recovery to avoid reconnect storms.
- Cache-busting synchronized to `v=100` for `index.html`.
- Service-worker cache namespace advanced to V18.
- Build information updated.

## Static validation
- `node --check app.js` must pass.
- ZIP integrity must pass.
- No service-role/private Supabase key should be present in frontend source.
- No `.bak` backup files should be shipped.

## Real-environment certification still required
These cannot honestly be marked PASS without access to the production services:
- Supabase RLS and Storage policies for every private/resource-owned table.
- Google OAuth and Apple OAuth provider configuration.
- Firebase/FCM API key, Web Push permissions and device token delivery.
- TURN/STUN credentials and cross-network WebRTC testing.
- Payment provider credentials/webhooks and transaction reconciliation.
- Real Android foreground/background tests on multiple network conditions.

## Recommended release test
1. Sign in on Android.
2. Open Messages and keep a conversation open.
3. Put the app in background for 30–60 seconds.
4. Send a message/reaction from another session.
5. Return to Tafaß and verify realtime recovery without logout.
6. Repeat for Notifications, Groups, Pages, Reels and Live.
