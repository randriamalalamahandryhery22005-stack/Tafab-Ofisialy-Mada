# Tafaß V19 — Final Production Security & Reliability Hardening

Date: 2026-09-05

## Included in the ZIP
- Client-side media upload validation for image/video MIME types and size limits.
- Realtime/session recovery remains intact from V18.
- Production cache version bumped to V19.
- Stronger Netlify security headers (HSTS and cross-domain policy baseline).
- `TAFASS_V19_PRODUCTION_SECURITY_HARDENING.sql` — safe, non-destructive Supabase hardening migration.

## Media limits
- Images: 20 MB maximum.
- Videos: 150 MB maximum.
- Only browser-reported image/* and video/* MIME types are accepted by the client guard.

These checks are UX protection only. Supabase Storage policies and server-side validation remain authoritative.

## Payment security
The public client may create only its own pending MGA payment requests. There is no client-side permission to update/delete payment rows through this migration. Payment settlement must be performed by a trusted backend/admin path.

## What cannot be certified from the ZIP alone
A true 100% production certification still requires execution against the deployed Supabase project and real provider configuration:
- RLS policy behavior with multiple users/roles
- Storage policies and actual bucket configuration
- Google/Apple OAuth redirect configuration
- Firebase/FCM credentials and push delivery
- TURN server connectivity for WebRTC
- Real payment-provider verification/webhooks
- Real Android browser/PWA E2E tests

Do not treat this README as proof that those external services are configured; it documents exactly what still needs live verification.
